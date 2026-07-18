package expo.modules.notificationlistener

import android.util.Log
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URL

/**
 * Groq Whisper Large V3 ASR — third fallback after Sarvam and NVIDIA Whisper.
 * Same model quality as NVIDIA's Whisper path; Groq's free tier gives 7 200
 * seconds of audio per day (plenty for personal call volume).
 *
 * Sends PCM as a WAV file via multipart/form-data to
 * api.groq.com/openai/v1/audio/transcriptions.
 */
object GroqAsrClient {
    private const val TAG = "GroqAsrClient"
    private const val ENDPOINT = "https://api.groq.com/openai/v1/audio/transcriptions"
    private const val CONNECT_TIMEOUT_MS = 20_000
    private const val READ_TIMEOUT_MS = 120_000

    sealed class Result {
        data class Success(val text: String) : Result()
        data class Error(val message: String) : Result()
        object NoApiKey : Result()
    }

    fun transcribe(apiKey: String, pcm: FloatArray): Result {
        if (apiKey.isBlank()) return Result.NoApiKey
        return try {
            val wav = pcmToWav(pcm)
            val boundary = "GroqBoundary${System.nanoTime()}"
            val body = buildMultipart(boundary, wav)

            val conn = URL(ENDPOINT).openConnection() as HttpURLConnection
            conn.requestMethod = "POST"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.doOutput = true
            conn.setRequestProperty("Authorization", "Bearer $apiKey")
            conn.setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
            conn.outputStream.use { it.write(body) }

            val status = conn.responseCode
            val text = (if (status in 200..299) conn.inputStream else conn.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            conn.disconnect()

            if (status in 200..299) {
                // response_format=text → body is the plain transcript
                Result.Success(text.trim())
            } else {
                Log.w(TAG, "Groq ASR HTTP $status: ${text.take(200)}")
                Result.Error("Groq ASR HTTP $status")
            }
        } catch (t: Throwable) {
            Log.w(TAG, "Groq ASR error: ${t.javaClass.simpleName}: ${t.message}")
            Result.Error("${t.javaClass.simpleName}: ${t.message}")
        }
    }

    private fun buildMultipart(boundary: String, wav: ByteArray): ByteArray {
        val out = ByteArrayOutputStream()
        fun bytes(s: String) = out.write(s.toByteArray(Charsets.UTF_8))
        fun field(name: String, value: String) {
            bytes("--$boundary\r\n")
            bytes("Content-Disposition: form-data; name=\"$name\"\r\n\r\n")
            bytes("$value\r\n")
        }

        field("model", "whisper-large-v3")
        field("response_format", "text")
        // "hi" instructs Whisper to expect Hindi/Hinglish; it still transcribes
        // English words in code-switched speech correctly.
        field("language", "hi")

        bytes("--$boundary\r\n")
        bytes("Content-Disposition: form-data; name=\"file\"; filename=\"call.wav\"\r\n")
        bytes("Content-Type: audio/wav\r\n\r\n")
        out.write(wav)
        bytes("\r\n--$boundary--\r\n")

        return out.toByteArray()
    }

    private fun pcmToWav(samples: FloatArray): ByteArray {
        val pcm = ByteArray(samples.size * 2)
        for (i in samples.indices) {
            val s = (samples[i].coerceIn(-1f, 1f) * 32767f).toInt()
            pcm[i * 2] = (s and 0xFF).toByte()
            pcm[i * 2 + 1] = ((s ushr 8) and 0xFF).toByte()
        }
        val sampleRate = 16000
        val byteRate = sampleRate * 2
        val out = ByteArrayOutputStream(44 + pcm.size)
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
