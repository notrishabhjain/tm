package expo.modules.notificationlistener

import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File

/**
 * Reads transcripts produced by the phone's own recorder app.
 *
 * On Xiaomi HyperOS the Recorder app can transcribe a call recording using
 * Xiaomi's cloud AI. That transcript is far better than anything we can produce
 * on-device, costs the user nothing, and needs no API key — so when one exists
 * we use it and skip our own ASR entirely.
 *
 * Two things make this awkward, and both shape the design:
 *
 *  1. **Transcription is user-initiated.** The recording appears at hang-up but
 *     the transcript only exists once the user opens it and taps transcribe —
 *     minutes or hours later, or never. So discovery cannot be a one-shot check
 *     at call end; the recovery sweep re-checks recordings that are still
 *     waiting (see CallTranscriptionService.AWAITING_TRANSCRIPT).
 *
 *  2. **The storage location is not documented** and differs across HyperOS
 *     builds. Rather than hardcode a guess, this searches a broad set of
 *     plausible locations and naming conventions, and [scanForDiagnostics]
 *     reports exactly what it finds so the real layout can be confirmed on a
 *     device instead of assumed.
 *
 * If the recorder keeps transcripts in its own app-private storage, no amount
 * of searching will reach them — the diagnostic will show nothing, and that is
 * itself the answer.
 */
object CallTranscriptSidecar {

    private const val TAG = "TranscriptSidecar"

    /** Extensions a transcript could plausibly arrive in. */
    private val TEXT_EXTENSIONS = setOf("txt", "srt", "vtt", "json", "lrc", "ass", "md", "text")

    /** Suffixes recorder apps append to the audio's base name. */
    private val NAME_SUFFIXES = listOf(
        "", "_transcript", "-transcript", ".transcript",
        "_text", "-text", "_stt", "-stt", "_asr", "-asr", "_ai", "-ai"
    )

    /** Directory names that commonly hold transcripts beside the audio. */
    private val NESTED_DIRS = listOf(
        "transcript", "transcripts", "text", "texts", "stt", "asr",
        "subtitle", "subtitles", "ai", "summary", "AI", "Transcript", "Text"
    )

    /**
     * Extra roots to sweep when looking for a transcript that is not beside the
     * audio. Kept separate from CallRecordingFinder's list because a transcript
     * may live in a text folder that never contains audio.
     */
    private val EXTRA_ROOTS = listOf(
        "/storage/emulated/0/MIUI/sound_recorder",
        "/storage/emulated/0/MIUI/sound_recorder/call_rec",
        "/storage/emulated/0/Recordings",
        "/storage/emulated/0/Recordings/Call recordings",
        "/storage/emulated/0/Recorder",
        "/storage/emulated/0/Documents",
        "/storage/emulated/0/Download"
    )

    /** A transcript shorter than this is a stub or an error page, not a call. */
    private const val MIN_USEFUL_CHARS = 40

    /** Cap on how much transcript we accept, mirroring the LLM input budget. */
    private const val MAX_CHARS = 20_000

    /**
     * How far apart a recording and its transcript may be modified and still be
     * considered a pair, when matching by timestamp rather than by name.
     * Generous because transcription happens whenever the user gets round to it.
     */
    private const val PAIR_WINDOW_MS = 7L * 24 * 60 * 60 * 1000

    data class Found(val file: File, val text: String)

    /**
     * Returns the transcript for [recording], or null if none exists yet.
     * Cheap enough to call on every sweep: it is a handful of File.exists()
     * checks before any directory listing.
     */
    fun findFor(context: Context, recording: File): Found? {
        val stem = recording.nameWithoutExtension
        if (stem.isBlank()) return null

        // 1. Exact name matches beside the audio, and one level down.
        val nearby = mutableListOf<File>()
        recording.parentFile?.let { parent ->
            nearby += candidateNames(stem).map { File(parent, it) }
            for (dirName in NESTED_DIRS) {
                val nested = File(parent, dirName)
                if (nested.isDirectory) {
                    nearby += candidateNames(stem).map { File(nested, it) }
                }
            }
        }
        for (f in nearby) {
            if (f.isFile && f.length() > 0) {
                readTranscript(f)?.let { return Found(f, it) }
            }
        }

        // 2. Name-similarity search across the recorder trees. Recorder apps
        //    sometimes rename the transcript (adding a caller or a date), so an
        //    exact match is not guaranteed even when a pairing clearly exists.
        val recMtime = recording.lastModified()
        for (root in searchRoots(context, recording)) {
            val match = walkForMatch(root, stem, recMtime)
            if (match != null) {
                readTranscript(match)?.let { return Found(match, it) }
            }
        }
        return null
    }

    private fun candidateNames(stem: String): List<String> =
        NAME_SUFFIXES.flatMap { suffix -> TEXT_EXTENSIONS.map { ext -> "$stem$suffix.$ext" } }

    private fun searchRoots(context: Context, recording: File): List<File> {
        val roots = LinkedHashSet<File>()
        recording.parentFile?.let { roots += it }
        roots += EXTRA_ROOTS.map { File(it) }
        // Any directory the user nominated for recordings is worth checking too.
        for (dir in CallRecordingFinder.candidateDirs(context)) roots += File(dir)
        return roots.filter { it.isDirectory }
    }

    /** Depth-limited search for a text file whose name relates to [stem]. */
    private fun walkForMatch(root: File, stem: String, recMtime: Long, depth: Int = 2): File? {
        val entries = root.listFiles() ?: return null
        val normStem = normalise(stem)
        for (entry in entries) {
            if (entry.isFile) {
                if (!TEXT_EXTENSIONS.contains(entry.extension.lowercase())) continue
                if (entry.length() == 0L) continue
                val normName = normalise(entry.nameWithoutExtension)
                val related = normName.contains(normStem) || normStem.contains(normName)
                val nearInTime = Math.abs(entry.lastModified() - recMtime) <= PAIR_WINDOW_MS
                if (related && nearInTime) return entry
            } else if (entry.isDirectory && depth > 0) {
                walkForMatch(entry, stem, recMtime, depth - 1)?.let { return it }
            }
        }
        return null
    }

    /** Lowercase, strip separators — recorder apps vary punctuation freely. */
    private fun normalise(s: String): String =
        s.lowercase().replace(Regex("[^a-z0-9]"), "")

    // ── Reading ──────────────────────────────────────────────────────────────

    /** Reads and normalises a transcript file, or null if unusable. */
    fun readTranscript(file: File): String? {
        return try {
            if (file.length() > 4L * 1024 * 1024) return null // not a transcript
            val raw = file.readText()
            val text = when (file.extension.lowercase()) {
                "json" -> parseJson(raw)
                "srt", "vtt", "ass" -> parseSubtitles(raw)
                "lrc" -> parseLrc(raw)
                else -> raw
            }
            val cleaned = text.replace(Regex("[ \\t]+"), " ")
                .replace(Regex("\\n{3,}"), "\n\n")
                .trim()
            if (cleaned.length < MIN_USEFUL_CHARS) null else cleaned.take(MAX_CHARS)
        } catch (e: Exception) {
            Log.w(TAG, "Could not read ${file.name}: ${e.message}")
            null
        }
    }

    /** Strips SRT/VTT/ASS timing lines, keeping spoken text in order. */
    private fun parseSubtitles(raw: String): String {
        val timing = Regex("""\d{1,2}:\d{2}(:\d{2})?[.,]\d{1,3}\s*-->""")
        val out = StringBuilder()
        var last = ""
        for (line in raw.lineSequence()) {
            val t = line.trim()
            if (t.isEmpty()) continue
            if (t.equals("WEBVTT", true)) continue
            if (t.toIntOrNull() != null) continue          // subtitle index
            if (timing.containsMatchIn(t)) continue         // timing line
            if (t.startsWith("Dialogue:")) {                // ASS
                val speech = t.substringAfterLast(",,").trim()
                if (speech.isNotEmpty() && speech != last) { out.append(speech).append('\n'); last = speech }
                continue
            }
            // Subtitle files repeat a caption across cues; drop consecutive repeats.
            if (t == last) continue
            out.append(t).append('\n')
            last = t
        }
        return out.toString()
    }

    /** Strips [mm:ss.xx] timestamps from LRC-style transcripts. */
    private fun parseLrc(raw: String): String =
        raw.lineSequence()
            .map { it.replace(Regex("""^\s*\[[^\]]*\]\s*"""), "").trim() }
            .filter { it.isNotEmpty() }
            .joinToString("\n")

    /**
     * Pulls speech out of a JSON transcript without knowing its schema.
     * Recorder apps differ wildly, so this walks the tree and collects the
     * string values of keys that plausibly hold speech, in document order.
     */
    private fun parseJson(raw: String): String {
        val keys = setOf("text", "transcript", "content", "sentence", "result", "value", "words")
        val out = StringBuilder()

        fun walk(node: Any?) {
            when (node) {
                is JSONObject -> {
                    for (key in node.keys()) {
                        val child = node.opt(key)
                        if (child is String) {
                            if (keys.contains(key.lowercase()) && child.isNotBlank()) {
                                out.append(child.trim()).append('\n')
                            }
                        } else {
                            walk(child)
                        }
                    }
                }
                is JSONArray -> {
                    for (i in 0 until node.length()) walk(node.opt(i))
                }
            }
        }

        return try {
            val trimmed = raw.trim()
            walk(if (trimmed.startsWith("[")) JSONArray(trimmed) else JSONObject(trimmed))
            // A JSON file we could not interpret is better returned raw than
            // silently treated as empty — the caller's length check still guards.
            if (out.isBlank()) raw else out.toString()
        } catch (_: Exception) {
            raw
        }
    }

    // ── Diagnostics ──────────────────────────────────────────────────────────

    /**
     * Reports what transcript-shaped files exist on this device and which
     * recordings they pair with.
     *
     * This exists because the recorder's storage layout is undocumented: rather
     * than hardcode a path that may be wrong, run this once on the device and
     * read the answer off it. Content previews are short and deliberately not
     * logged anywhere persistent.
     */
    fun scanForDiagnostics(context: Context, maxRecordings: Int = 5): Map<String, Any> {
        val recordings = try {
            CallRecordingFinder.findRecentRecordings(
                context, 30L * 24 * 60 * 60 * 1000, maxRecordings
            )
        } catch (_: Exception) {
            emptyList<File>()
        }

        val pairs = recordings.map { rec ->
            val found = try { findFor(context, rec) } catch (_: Exception) { null }
            mapOf(
                "recording" to rec.absolutePath,
                "recordingModified" to rec.lastModified().toDouble(),
                "transcriptFound" to (found != null),
                "transcriptPath" to (found?.file?.absolutePath ?: ""),
                "transcriptChars" to (found?.text?.length ?: 0),
                "preview" to (found?.text?.take(160) ?: "")
            )
        }

        // Everything text-shaped in the recorder trees, so an unrecognised
        // naming convention is still visible rather than silently missed.
        val loose = mutableListOf<Map<String, Any>>()
        val seen = HashSet<String>()
        for (root in EXTRA_ROOTS.map { File(it) }.filter { it.isDirectory }) {
            collectTextFiles(root, loose, seen, depth = 2, cap = 40)
        }

        return mapOf(
            "recordingsChecked" to recordings.size,
            "pairs" to pairs,
            "looseTextFiles" to loose,
            "rootsSearched" to EXTRA_ROOTS.filter { File(it).isDirectory }
        )
    }

    private fun collectTextFiles(
        dir: File,
        out: MutableList<Map<String, Any>>,
        seen: HashSet<String>,
        depth: Int,
        cap: Int
    ) {
        if (out.size >= cap) return
        val entries = dir.listFiles() ?: return
        for (entry in entries) {
            if (out.size >= cap) return
            if (entry.isFile) {
                if (!TEXT_EXTENSIONS.contains(entry.extension.lowercase())) continue
                if (!seen.add(entry.absolutePath)) continue
                out += mapOf(
                    "path" to entry.absolutePath,
                    "bytes" to entry.length().toDouble(),
                    "modified" to entry.lastModified().toDouble(),
                    "readable" to (readTranscript(entry) != null)
                )
            } else if (entry.isDirectory && depth > 0) {
                collectTextFiles(entry, out, seen, depth - 1, cap)
            }
        }
    }
}
