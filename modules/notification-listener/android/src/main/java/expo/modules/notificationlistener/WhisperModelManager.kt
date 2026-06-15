package expo.modules.notificationlistener

import android.content.Context
import android.util.Log
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Downloads and stores the on-device whisper.cpp model used for in-app call
 * transcription. medium-q5_0 (~530 MB) is a noticeably more accurate step up
 * from small-q5_1 on Hindi/Hinglish and accented speech, at roughly 2-3x the
 * transcription time.
 */
object WhisperModelManager {
    private const val TAG = "WhisperModelManager"

    const val MODEL_FILENAME = "ggml-medium-q5_0.bin"
    private const val MODEL_URL =
        "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/$MODEL_FILENAME"

    fun modelFile(context: Context): File =
        File(File(context.filesDir, "whisper"), MODEL_FILENAME)

    fun isModelDownloaded(context: Context): Boolean {
        val f = modelFile(context)
        return f.exists() && f.length() > 0
    }

    fun deleteModel(context: Context) {
        modelFile(context).delete()
    }

    /**
     * Downloads the model, calling [onProgress] with 0-100. Throws on
     * failure; caller should clean up the partial file (handled here via a
     * .part temp file that's only renamed on success).
     */
    fun downloadModel(context: Context, onProgress: (Int) -> Unit) {
        val target = modelFile(context)
        target.parentFile?.mkdirs()
        val tmp = File(target.parentFile, "$MODEL_FILENAME.part")

        val url = URL(MODEL_URL)
        val conn = url.openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = true
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000

        try {
            conn.connect()
            if (conn.responseCode !in 200..299) {
                throw java.io.IOException("HTTP ${conn.responseCode}")
            }
            val total = conn.contentLengthLong
            var downloaded = 0L

            conn.inputStream.use { input ->
                tmp.outputStream().use { output ->
                    val buffer = ByteArray(64 * 1024)
                    var lastReportedPct = -1
                    while (true) {
                        val read = input.read(buffer)
                        if (read == -1) break
                        output.write(buffer, 0, read)
                        downloaded += read
                        if (total > 0) {
                            val pct = ((downloaded * 100) / total).toInt()
                            if (pct != lastReportedPct) {
                                lastReportedPct = pct
                                onProgress(pct)
                            }
                        }
                    }
                }
            }

            if (!tmp.renameTo(target)) {
                throw java.io.IOException("Failed to finalize downloaded model")
            }
            onProgress(100)
        } catch (e: Exception) {
            Log.w(TAG, "Model download failed: ${e.message}")
            tmp.delete()
            throw e
        } finally {
            conn.disconnect()
        }
    }
}
