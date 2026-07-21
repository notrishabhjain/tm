package expo.modules.notificationlistener

import android.content.Context
import android.provider.MediaStore
import java.io.File

/**
 * Locates the newest call-recording file written by the phone's built-in
 * recorder. Mirrors the logic from the Termux transcribe_call.sh script
 * (settings/call-transcription.tsx) so both paths agree on where recordings
 * live and how staleness/dedup is decided.
 */
object CallRecordingFinder {
    private const val PREFS = "taskmind_prefs"
    private const val KEY_LAST_PROCESSED = "call_transcription_last_recording"
    private const val KEY_CUSTOM_DIR = "call_transcription_custom_dir"

    // Common locations across OEMs for call recordings, checked in order.
    private val DEFAULT_DIRS = listOf(
        // OnePlus / Oppo / Realme (ColorOS & OxygenOS 12+) — the modern dialer
        // writes to Music/Recordings/Call Recordings
        "/storage/emulated/0/Music/Recordings/Call Recordings",
        "/storage/emulated/0/Music/Recordings/Call",
        "/storage/emulated/0/Record/PhoneRecord",
        "/storage/emulated/0/Recordings/Record/PhoneRecord",
        // Vivo / iQOO (FunTouch OS / OriginOS)
        "/storage/emulated/0/Record/Call",
        "/storage/emulated/0/Recordings/Record/Call Recordings",
        // Samsung
        "/storage/emulated/0/Recordings/Record/Call",
        "/storage/emulated/0/Recordings/Call",
        // Generic / AOSP
        "/storage/emulated/0/Recordings/CallRecordings",
        "/storage/emulated/0/Call",
        "/storage/emulated/0/CallRecordings",
        "/storage/emulated/0/CallRecorder",
        // Xiaomi / MIUI / HyperOS — classic paths
        "/storage/emulated/0/MIUI/sound_recorder/call_rec",
        "/storage/emulated/0/MIUI/sounds/Call",
        "/storage/emulated/0/MIUI/sounds",
        // Xiaomi HyperOS 1.x / 2.x — newer recorder paths
        "/storage/emulated/0/Recordings/Call recordings",
        "/storage/emulated/0/Recordings/Call Recording",
        "/storage/emulated/0/Sound Recorder",
        // OnePlus legacy (OxygenOS 11 and older)
        "/storage/emulated/0/Sounds/Call",
        "/storage/emulated/0/Record",
        // Pixel / stock Android dialer
        "/storage/emulated/0/Documents/Call Recordings",
        "/storage/emulated/0/Music/Call Recordings",
        // Huawei / EMUI
        "/storage/emulated/0/Recorder/CallRecord",
        "/storage/emulated/0/Sounds/CallRecord",
        // Third-party call recorder apps
        "/storage/emulated/0/CallRecording",
        "/storage/emulated/0/PhoneCallRecordings",
        "/storage/emulated/0/Music/Recordings",
        "/storage/emulated/0/Sounds",
    )

    private val AUDIO_EXTENSIONS = setOf("m4a", "amr", "3gp", "mp3", "wav", "aac", "opus", "ogg")

    // Path keywords that indicate a file is a call recording (used by MediaStore scan).
    private val CALL_RECORDING_KEYWORDS = listOf("call", "record", "phone", "voice", "dialer", "rec")

    /** Max age (ms) for a recording to be considered "from this call".
     *  Extended to 30 min to cover retry attempts inside CallTranscriptionService. */
    private const val MAX_AGE_MS = 30 * 60 * 1000L

    fun candidateDirs(context: Context): List<String> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val custom = prefs.getString(KEY_CUSTOM_DIR, null)
        return if (!custom.isNullOrBlank()) listOf(custom) + DEFAULT_DIRS else DEFAULT_DIRS
    }

    fun setCustomDir(context: Context, dir: String?) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_CUSTOM_DIR, dir).apply()
    }

    /**
     * Returns the newest recording file from any candidate directory that is
     * younger than [MAX_AGE_MS] and was not already handed off, or null.
     *
     * Scans each candidate directory plus ONE level of subdirectories — several
     * OEM recorders group recordings into per-contact or per-date folders
     * (e.g. ColorOS "Call Recordings/<contact name>/xxx.mp3").
     *
     * Falls back to a MediaStore query if the directory scan finds nothing —
     * this catches recordings saved to any path not in the hardcoded list.
     */
    fun findLatestUnprocessed(context: Context): File? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lastProcessed = prefs.getString(KEY_LAST_PROCESSED, null)

        var newest: File? = null
        fun consider(f: File) {
            if (newest == null || f.lastModified() > newest!!.lastModified()) newest = f
        }

        for (dirPath in candidateDirs(context)) {
            val dir = File(dirPath)
            val entries = dir.listFiles() ?: continue
            for (entry in entries) {
                if (entry.isFile && AUDIO_EXTENSIONS.contains(entry.extension.lowercase())) {
                    consider(entry)
                } else if (entry.isDirectory) {
                    val nested = entry.listFiles { f ->
                        f.isFile && AUDIO_EXTENSIONS.contains(f.extension.lowercase())
                    } ?: continue
                    for (f in nested) consider(f)
                }
            }
        }

        // MediaStore fallback: catches recordings saved to any path not in DEFAULT_DIRS.
        if (newest == null) {
            val cutoff = System.currentTimeMillis() - MAX_AGE_MS
            for (f in queryMediaStore(context, cutoff, 5)) consider(f)
        }

        val found = newest ?: return null
        if (found.absolutePath == lastProcessed) return null

        val age = System.currentTimeMillis() - found.lastModified()
        if (age > MAX_AGE_MS) return null

        return found
    }

    fun markProcessed(context: Context, file: File) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_LAST_PROCESSED, file.absolutePath).apply()
    }

    /**
     * Recovery-sweep finder: returns ALL audio recordings (each candidate dir
     * plus one subdirectory level) newer than [maxAgeMs], newest first, capped
     * at [limit]. Unlike [findLatestUnprocessed] this ignores the last-processed
     * marker and the 30-minute freshness window — deduplication against
     * already-processed recordings is the caller's job (CallRecordStore).
     *
     * Also performs a MediaStore scan so recordings in non-standard paths are
     * included. Results are deduped by absolute path before returning.
     */
    fun findRecentRecordings(context: Context, maxAgeMs: Long, limit: Int): List<File> {
        val cutoff = System.currentTimeMillis() - maxAgeMs
        val found = mutableListOf<File>()
        for (dirPath in candidateDirs(context)) {
            val dir = File(dirPath)
            val entries = dir.listFiles() ?: continue
            for (entry in entries) {
                if (entry.isFile && AUDIO_EXTENSIONS.contains(entry.extension.lowercase())) {
                    if (entry.lastModified() >= cutoff) found.add(entry)
                } else if (entry.isDirectory) {
                    val nested = entry.listFiles { f ->
                        f.isFile && AUDIO_EXTENSIONS.contains(f.extension.lowercase())
                    } ?: continue
                    for (f in nested) if (f.lastModified() >= cutoff) found.add(f)
                }
            }
        }

        // MediaStore fallback — merge in any recordings outside the known directories.
        for (f in queryMediaStore(context, cutoff, limit)) {
            if (found.none { it.absolutePath == f.absolutePath }) found.add(f)
        }

        return found.sortedByDescending { it.lastModified() }.take(limit)
    }

    /**
     * Queries MediaStore.Audio for recently modified files whose path suggests
     * they are call recordings. Returns up to [limit] files sorted newest-first.
     *
     * This is a best-effort fallback — it only runs when the directory scan
     * finds nothing, so false positives from keyword-matching are acceptable;
     * the LLM analysis step will discard non-call audio gracefully.
     */
    private fun queryMediaStore(context: Context, cutoffMs: Long, limit: Int): List<File> {
        return try {
            val uri = MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
            val projection = arrayOf(
                MediaStore.Audio.Media.DATA,
                MediaStore.Audio.Media.DATE_MODIFIED
            )
            // DATE_MODIFIED is stored in seconds in MediaStore.
            val selection = "${MediaStore.Audio.Media.DATE_MODIFIED} >= ?"
            val selectionArgs = arrayOf("${cutoffMs / 1000}")
            val sortOrder = "${MediaStore.Audio.Media.DATE_MODIFIED} DESC"

            context.contentResolver.query(uri, projection, selection, selectionArgs, sortOrder)
                ?.use { cursor ->
                    val dataIdx = cursor.getColumnIndex(MediaStore.Audio.Media.DATA)
                    val results = mutableListOf<File>()
                    while (cursor.moveToNext() && results.size < limit) {
                        val path = cursor.getString(dataIdx) ?: continue
                        val lower = path.lowercase()
                        if (CALL_RECORDING_KEYWORDS.any { lower.contains(it) }) {
                            val f = File(path)
                            if (f.isFile && AUDIO_EXTENSIONS.contains(f.extension.lowercase())) {
                                results.add(f)
                            }
                        }
                    }
                    results
                } ?: emptyList()
        } catch (_: Exception) {
            emptyList()
        }
    }
}
