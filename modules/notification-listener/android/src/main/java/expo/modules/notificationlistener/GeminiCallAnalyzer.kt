package expo.modules.notificationlistener

import android.content.Context
import android.util.Base64
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * The primary call engine: ONE Gemini 2.5 Flash call takes the recording audio
 * and returns transcript + summary + extracted tasks together. Gemini's native
 * Hindi/Hinglish audio understanding beats the Whisper→LLM chain on Indian
 * phone audio, and the free tier comfortably covers personal call volume.
 *
 * On any failure (quota, network, bad key) the caller falls back to the legacy
 * NVIDIA path (Whisper ASR + Llama 70B extraction) — the pipeline never dies.
 *
 * Supports both Google key formats:
 *  - "AIza…"  → Gemini API (generativelanguage.googleapis.com)
 *  - "AQ.…"   → Vertex AI express mode (aiplatform.googleapis.com)
 */
object GeminiCallAnalyzer {
    private const val TAG = "GeminiCallAnalyzer"
    private const val DEFAULT_MODEL = "gemini-2.5-flash"
    private const val CONNECT_TIMEOUT_MS = 30_000
    private const val READ_TIMEOUT_MS = 180_000
    private const val MAX_ATTEMPTS = 2
    private const val RETRY_BACKOFF_MS = 10_000L

    // Inline audio must keep the total request under 20 MB; base64 adds ~33%.
    private const val MAX_AUDIO_BYTES = 14 * 1024 * 1024

    // Extensions Gemini accepts as-is — everything else is decoded to WAV.
    private val DIRECT_MIME = mapOf(
        "mp3" to "audio/mp3",
        "wav" to "audio/wav",
        "aac" to "audio/aac",
        "ogg" to "audio/ogg",
        "opus" to "audio/ogg",
        "flac" to "audio/flac"
    )

    sealed class Result {
        data class Success(
            val transcript: String,
            val extraction: NvidiaLlmClient.CallExtraction
        ) : Result()
        data class Error(val message: String) : Result()
        object NoApiKey : Result()
    }

    fun apiKey(context: Context): String =
        context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            .getString("gemini_api_key", null).orEmpty().trim()
            .ifBlank { DefaultKeys.GEMINI }

    /** Blocks (network + possible decode) — call off the main thread. */
    fun analyze(
        context: Context,
        recording: File,
        callTimeMs: Long,
        callerLabel: String
    ): Result {
        val key = apiKey(context)
        if (key.isBlank()) return Result.NoApiKey
        val model = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            .getString("gemini_model", null).orEmpty().ifBlank { DEFAULT_MODEL }

        val (audioBytes, mime) = prepareAudio(recording)
            ?: return Result.Error("Could not read or decode ${recording.name}")

        val prompt = buildPrompt(callTimeMs, callerLabel)
        val body = JSONObject().apply {
            put("contents", JSONArray().put(JSONObject().apply {
                put("role", "user")
                put("parts", JSONArray()
                    .put(JSONObject().put("inlineData", JSONObject().apply {
                        put("mimeType", mime)
                        put("data", Base64.encodeToString(audioBytes, Base64.NO_WRAP))
                    }))
                    .put(JSONObject().put("text", prompt))
                )
            }))
            put("generationConfig", JSONObject().apply {
                put("temperature", 0.1)
                put("maxOutputTokens", 8192)
                put("responseMimeType", "application/json")
            })
        }.toString()

        val encodedKey = URLEncoder.encode(key, "UTF-8")
        val url = if (key.startsWith("AIza")) {
            "https://generativelanguage.googleapis.com/v1beta/models/$model:generateContent?key=$encodedKey"
        } else {
            // Vertex AI express-mode keys ("AQ.…")
            "https://aiplatform.googleapis.com/v1/publishers/google/models/$model:generateContent?key=$encodedKey"
        }

        var lastError = "unknown"
        for (attempt in 1..MAX_ATTEMPTS) {
            when (val r = post(url, body)) {
                is HttpResult.Ok -> {
                    val text = extractText(r.body)
                        ?: return Result.Error("Gemini returned no content")
                    val transcript = try {
                        JSONObject(sliceJson(text)).optString("transcript", "")
                    } catch (_: Exception) { "" }
                    val extraction = NvidiaLlmClient.parseExtraction(text, callTimeMs)
                        ?: return Result.Error("Could not parse Gemini output")
                    return Result.Success(transcript.trim(), extraction)
                }
                is HttpResult.Fail -> {
                    lastError = r.message
                    if (!r.retryable) return Result.Error(r.message)
                }
            }
            if (attempt < MAX_ATTEMPTS) Thread.sleep(RETRY_BACKOFF_MS)
        }
        return Result.Error(lastError)
    }

    /**
     * Original file bytes when Gemini accepts the format directly (MIUI writes
     * mp3 — no decode at all); otherwise decode → 16 kHz mono WAV. Both paths
     * are size-capped for the inline-data request limit.
     */
    private fun prepareAudio(recording: File): Pair<ByteArray, String>? {
        val mime = DIRECT_MIME[recording.extension.lowercase()]
        if (mime != null && recording.length() in 1..MAX_AUDIO_BYTES.toLong()) {
            return try {
                recording.readBytes() to mime
            } catch (t: Throwable) {
                Log.w(TAG, "Read failed for ${recording.name}: ${t.message}")
                null
            }
        }
        val pcm = AudioDecoder.decodeToWhisperPcm(recording.absolutePath) ?: return null
        // 16-bit mono 16 kHz = 32 KB/s → cap keeps the request within limits.
        val maxSamples = MAX_AUDIO_BYTES / 2
        val clipped = if (pcm.size > maxSamples) pcm.copyOf(maxSamples) else pcm
        return pcmToWav(clipped) to "audio/wav"
    }

    private fun buildPrompt(callTimeMs: Long, callerLabel: String): String {
        val callDate = SimpleDateFormat("EEEE, d MMMM yyyy, h:mm a", Locale.ENGLISH)
            .format(Date(callTimeMs))
        return """This audio is a recorded phone call belonging to a busy Indian professional (the OWNER of this phone). The other party is "$callerLabel". Call date: $callDate (Indian time). Speech is Hindi, English, or Hinglish — understand it as a native speaker.

Do two things:
1. Transcribe the call faithfully. Keep Hinglish as spoken (Latin script is fine). If a section is unintelligible, write [unclear] rather than guessing.
2. Extract ONLY concrete action items — commitments the OWNER made or was directly asked to do. Resolve ALL relative dates ("kal", "parso", "aaj shaam", "tomorrow", "by Friday") against the call date above; if a date has no time, use 18:00.

Return ONLY this JSON:
{
  "transcript": "<the full transcript>",
  "reasoning": "<each commitment found, who owns it, and its deadline — or 'none'>",
  "summary": "<2-3 sentence English summary of the call>",
  "topics": ["<short topic>", ...],
  "tasks": [
    {
      "title": "<imperative, ≤60 chars, English, quoting specifics (names/amounts/documents)>",
      "priority": "URGENT|HIGH|MEDIUM|LOW",
      "dueDate": "<ISO 8601 date-time or null>",
      "assignedToMe": <true if the OWNER must act, false if the other party committed>,
      "notes": "<amounts, references, context — null if none>"
    }
  ]
}

PRECISION RULES (accuracy over recall):
- Only commitments ACTUALLY SPOKEN — never invent or infer tasks.
- Small talk, opinions, and general discussion are not tasks.
- Merge near-duplicates into one task.
- If the audio is silent or unintelligible, return an empty tasks array.
Priority: URGENT = explicit urgency or within ~24h (urgent/ASAP/abhi/aaj/turant); HIGH = 1-3 days or clearly important (kal tak); MEDIUM = real task, no stated urgency; LOW = optional (jab time mile)."""
    }

    private sealed class HttpResult {
        data class Ok(val body: String) : HttpResult()
        data class Fail(val message: String, val retryable: Boolean) : HttpResult()
    }

    private fun post(url: String, body: String): HttpResult {
        return try {
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }

            val code = conn.responseCode
            val text = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()

            if (code in 200..299) HttpResult.Ok(text)
            else {
                Log.w(TAG, "Gemini HTTP $code: ${text.take(300)}")
                HttpResult.Fail(
                    "Gemini HTTP $code: ${text.take(150)}",
                    retryable = code == 429 || code >= 500
                )
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Gemini request failed: ${t.javaClass.simpleName}: ${t.message}")
            HttpResult.Fail("${t.javaClass.simpleName}: ${t.message}", retryable = true)
        }
    }

    /** Concatenates all text parts of the first candidate. */
    private fun extractText(responseBody: String): String? {
        return try {
            val parts = JSONObject(responseBody)
                .getJSONArray("candidates").getJSONObject(0)
                .getJSONObject("content").getJSONArray("parts")
            val sb = StringBuilder()
            for (i in 0 until parts.length()) {
                sb.append(parts.getJSONObject(i).optString("text", ""))
            }
            sb.toString().takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            Log.w(TAG, "Unexpected Gemini response shape: ${e.message}")
            null
        }
    }

    /** Trims prose/fences around the JSON object. */
    private fun sliceJson(raw: String): String {
        val start = raw.indexOf('{')
        val end = raw.lastIndexOf('}')
        return if (start >= 0 && end > start) raw.substring(start, end + 1) else raw
    }

    /** Wraps -1..1 float PCM as 16 kHz mono 16-bit WAV. */
    private fun pcmToWav(samples: FloatArray): ByteArray {
        val pcm = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val s = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt()
            pcm[i * 2] = (s and 0xFF).toByte()
            pcm[i * 2 + 1] = ((s ushr 8) and 0xFF).toByte()
        }
        val sampleRate = 16000
        val byteRate = sampleRate * 2
        val out = java.io.ByteArrayOutputStream(44 + pcm.size)
        fun str(s: String) = out.write(s.toByteArray(Charsets.US_ASCII))
        fun i32(v: Int) {
            out.write(v and 0xFF); out.write((v ushr 8) and 0xFF)
            out.write((v ushr 16) and 0xFF); out.write((v ushr 24) and 0xFF)
        }
        fun i16(v: Int) { out.write(v and 0xFF); out.write((v ushr 8) and 0xFF) }
        str("RIFF"); i32(36 + pcm.size); str("WAVE")
        str("fmt "); i32(16); i16(1); i16(1); i32(sampleRate); i32(byteRate); i16(2); i16(16)
        str("data"); i32(pcm.size); out.write(pcm)
        return out.toByteArray()
    }
}
