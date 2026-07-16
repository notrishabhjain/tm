package expo.modules.notificationlistener

import android.util.Log
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.DataOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sarvam AI speech-to-text — purpose-built for Indian languages and Hinglish
 * code-switching, far more accurate than Whisper on Hindi phone audio.
 *
 * The synchronous REST endpoint accepts clips up to ~30 s, so longer calls are
 * split into chunks (cut at the quietest sample near each boundary to avoid
 * slicing words) and transcribed sequentially.
 *
 * Used when a Sarvam API key is configured; NVIDIA Whisper remains the
 * fallback engine both when no key is set and when Sarvam fails.
 */
object SarvamAsrClient {
    private const val TAG = "SarvamAsrClient"
    private const val ENDPOINT = "https://api.sarvam.ai/speech-to-text"
    const val DEFAULT_MODEL = "saarika:v2.5"
    private const val SAMPLE_RATE = 16000

    // Sync endpoint limit is 30 s — chunk at 29 s with a 2 s window in which
    // the quietest sample is chosen as the actual cut point.
    private const val CHUNK_SECONDS = 29
    private const val CUT_WINDOW_SECONDS = 2
    private const val MAX_AUDIO_SAMPLES = 15 * 60 * SAMPLE_RATE
    private const val TIMEOUT_MS = 45_000

    sealed class Result {
        data class Success(val text: String) : Result()
        data class Error(val message: String) : Result()
        object NoApiKey : Result()
    }

    /**
     * Transcribes 16 kHz mono PCM (−1..1 floats, see AudioDecoder). Blocks —
     * call off the main thread. Fails the whole call if any chunk fails after
     * a retry, so the caller can fall back to another engine.
     */
    fun transcribe(apiKey: String, pcm: FloatArray, model: String = DEFAULT_MODEL): Result {
        if (apiKey.isBlank()) return Result.NoApiKey
        val clipped = if (pcm.size > MAX_AUDIO_SAMPLES) {
            Log.i(TAG, "Audio truncated to ${MAX_AUDIO_SAMPLES / SAMPLE_RATE / 60} min")
            pcm.copyOf(MAX_AUDIO_SAMPLES)
        } else pcm

        val transcript = StringBuilder()
        var start = 0
        while (start < clipped.size) {
            val end = chunkEnd(clipped, start)
            val chunk = clipped.copyOfRange(start, end)
            start = end

            var chunkText: String? = null
            var lastError = "unknown"
            for (attempt in 1..2) {
                when (val r = transcribeChunk(apiKey, chunk, model)) {
                    is ChunkResult.Text -> { chunkText = r.text; break }
                    is ChunkResult.Fail -> {
                        lastError = r.message
                        // 401/403/429 won't heal on immediate retry of the next chunk either.
                        if (r.permanent) return Result.Error(r.message)
                    }
                }
                if (attempt == 1) Thread.sleep(1_500)
            }
            if (chunkText == null) return Result.Error(lastError)
            if (chunkText.isNotBlank()) {
                if (transcript.isNotEmpty()) transcript.append(' ')
                transcript.append(chunkText.trim())
            }
        }

        val text = transcript.toString().trim()
        return if (text.isEmpty()) Result.Error("Empty transcript (silent or unintelligible audio)")
        else Result.Success(text)
    }

    /** End index for the chunk starting at [start] — quietest point near the 29 s mark. */
    private fun chunkEnd(pcm: FloatArray, start: Int): Int {
        val hardEnd = minOf(start + CHUNK_SECONDS * SAMPLE_RATE, pcm.size)
        if (hardEnd == pcm.size) return hardEnd
        var quietest = hardEnd
        var quietestAmp = Float.MAX_VALUE
        val windowStart = hardEnd - CUT_WINDOW_SECONDS * SAMPLE_RATE
        var i = windowStart
        while (i < hardEnd) {
            val amp = kotlin.math.abs(pcm[i])
            if (amp < quietestAmp) { quietestAmp = amp; quietest = i }
            i += 160 // 10 ms stride is plenty for finding a pause
        }
        return quietest
    }

    private sealed class ChunkResult {
        data class Text(val text: String) : ChunkResult()
        data class Fail(val message: String, val permanent: Boolean) : ChunkResult()
    }

    private fun transcribeChunk(apiKey: String, pcm: FloatArray, model: String): ChunkResult {
        return try {
            val wav = pcm16ToWav(floatToPcm16Le(pcm), SAMPLE_RATE)
            val boundary = "----TaskMind${System.nanoTime()}"
            val conn = URL(ENDPOINT).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = TIMEOUT_MS
            conn.readTimeout = TIMEOUT_MS
            conn.doOutput = true
            conn.setRequestProperty("api-subscription-key", apiKey)
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")

            DataOutputStream(conn.outputStream).use { out ->
                fun field(name: String, value: String) {
                    out.writeBytes("--$boundary\r\n")
                    out.writeBytes("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
                    out.writeBytes("$value\r\n")
                }
                field("model", model)
                // Auto language detection — calls freely mix Hindi and English.
                field("language_code", "unknown")
                // Newer saaras models take an output mode; saarika ignores it.
                if (model.startsWith("saaras")) field("mode", "transcribe")
                out.writeBytes("--$boundary\r\n")
                out.writeBytes(
                    "Content-Disposition: form-data; name=\"file\"; filename=\"audio.wav\"\r\n"
                )
                out.writeBytes("Content-Type: audio/wav\r\n\r\n")
                out.write(wav)
                out.writeBytes("\r\n--$boundary--\r\n")
            }

            val code = conn.responseCode
            val body = (if (code in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()

            if (code !in 200..299) {
                Log.w(TAG, "Sarvam HTTP $code: ${body.take(200)}")
                return ChunkResult.Fail(
                    "Sarvam HTTP $code: ${body.take(120)}",
                    permanent = code == 401 || code == 403
                )
            }
            ChunkResult.Text(JSONObject(body).optString("transcript", ""))
        } catch (e: Exception) {
            Log.w(TAG, "Sarvam ASR error: ${e.javaClass.simpleName}: ${e.message}")
            ChunkResult.Fail("${e.javaClass.simpleName}: ${e.message}", permanent = false)
        }
    }

    /** Converts FloatArray (−1..1) to little-endian signed 16-bit PCM. */
    private fun floatToPcm16Le(samples: FloatArray): ByteArray {
        val out = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val s = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt().toShort()
            out[i * 2] = (s.toInt() and 0xFF).toByte()
            out[i * 2 + 1] = ((s.toInt() ushr 8) and 0xFF).toByte()
        }
        return out
    }

    /** Wraps mono 16-bit PCM in a minimal 44-byte WAV (RIFF) container. */
    private fun pcm16ToWav(pcm: ByteArray, sampleRate: Int): ByteArray {
        val channels = 1
        val bitsPerSample = 16
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = channels * bitsPerSample / 8
        val dataLen = pcm.size
        val out = ByteArrayOutputStream(44 + dataLen)

        fun writeStr(s: String) = out.write(s.toByteArray(Charsets.US_ASCII))
        fun writeIntLe(v: Int) {
            out.write(v and 0xFF); out.write((v ushr 8) and 0xFF)
            out.write((v ushr 16) and 0xFF); out.write((v ushr 24) and 0xFF)
        }
        fun writeShortLe(v: Int) { out.write(v and 0xFF); out.write((v ushr 8) and 0xFF) }

        writeStr("RIFF"); writeIntLe(36 + dataLen); writeStr("WAVE")
        writeStr("fmt "); writeIntLe(16); writeShortLe(1) // PCM
        writeShortLe(channels); writeIntLe(sampleRate); writeIntLe(byteRate)
        writeShortLe(blockAlign); writeShortLe(bitsPerSample)
        writeStr("data"); writeIntLe(dataLen); out.write(pcm)
        return out.toByteArray()
    }
}
