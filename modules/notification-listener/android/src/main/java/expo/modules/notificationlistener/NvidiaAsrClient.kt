package expo.modules.notificationlistener

import android.util.Log
import org.json.JSONObject
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sends a call-recording audio file to NVIDIA cloud ASR (Whisper Large V3) via
 * the standard OpenAI-compatible REST endpoint at integrate.api.nvidia.com.
 * No native libraries required — uses Android's built-in HttpURLConnection.
 *
 * Note: the gRPC endpoint (grpc.nvcf.nvidia.com) is for self-hosted NIM containers
 * only and returns UNIMPLEMENTED for the free-tier cloud API.
 */
object NvidiaAsrClient {
    private const val TAG = "NvidiaAsrClient"
    private const val ASR_URL = "https://integrate.api.nvidia.com/v1/audio/transcriptions"
    const val MODEL = "openai/whisper-large-v3"
    private const val CONNECT_TIMEOUT_MS = 15_000
    private const val READ_TIMEOUT_MS = 180_000  // 3 min for large recordings

    sealed class Result {
        data class Success(val text: String) : Result()
        data class Error(val message: String) : Result()
        object NoApiKey : Result()
    }

    /**
     * Sends [audioFile] to NVIDIA cloud ASR and returns the transcript.
     * Streams the file directly — no PCM decode required.
     * Blocks the calling thread — must be called off the main thread.
     */
    fun transcribeFile(apiKey: String, audioFile: File, language: String = "hi"): Result {
        if (apiKey.isBlank()) return Result.NoApiKey
        return try {
            val boundary = "----TaskMindBoundary${System.currentTimeMillis()}"
            val CRLF = "\r\n"

            val conn = (URL(ASR_URL).openConnection() as HttpURLConnection).apply {
                requestMethod = "POST"
                setRequestProperty("Authorization", "Bearer $apiKey")
                setRequestProperty("Content-Type", "multipart/form-data; boundary=$boundary")
                setRequestProperty("Accept", "application/json")
                doOutput = true
                connectTimeout = CONNECT_TIMEOUT_MS
                readTimeout = READ_TIMEOUT_MS
                setChunkedStreamingMode(64 * 1024)
            }

            conn.outputStream.use { os ->
                fun w(s: String) = os.write(s.toByteArray(Charsets.UTF_8))
                // model
                w("--$boundary$CRLF")
                w("Content-Disposition: form-data; name=\"model\"$CRLF$CRLF")
                w("$MODEL$CRLF")
                // language (helps Whisper with Hindi/Hinglish)
                w("--$boundary$CRLF")
                w("Content-Disposition: form-data; name=\"language\"$CRLF$CRLF")
                w("$language$CRLF")
                // audio file
                w("--$boundary$CRLF")
                w("Content-Disposition: form-data; name=\"file\"; filename=\"${audioFile.name}\"$CRLF")
                w("Content-Type: application/octet-stream$CRLF$CRLF")
                audioFile.inputStream().use { it.copyTo(os, bufferSize = 64 * 1024) }
                w("$CRLF--$boundary--$CRLF")
            }

            val code = conn.responseCode
            val body = try {
                if (code in 200..299) conn.inputStream.bufferedReader().readText()
                else conn.errorStream?.bufferedReader()?.readText() ?: ""
            } catch (_: Exception) { "" }
            conn.disconnect()

            if (code !in 200..299) {
                return Result.Error("HTTP $code: ${body.take(300)}")
            }

            val text = try { JSONObject(body).getString("text") } catch (_: Exception) { null }
            if (text.isNullOrBlank()) Result.Error("Empty transcript in response")
            else Result.Success(text.trim())
        } catch (e: Exception) {
            Log.w(TAG, "NVIDIA ASR error: ${e.javaClass.simpleName}: ${e.message}")
            Result.Error("${e.javaClass.simpleName}: ${e.message}")
        }
    }
}
