package expo.modules.notificationlistener

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Log
import androidx.core.content.FileProvider
import java.io.File
import java.io.RandomAccessFile
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * On-device speech recognition using Android's SpeechRecognizer.
 *
 * On Xiaomi HyperOS devices this routes to Xiaomi's built-in AI speech engine
 * (the same model powering voice input and HyperAI dictation). No model download
 * or network connection required.
 *
 * Usage in the call-transcription pipeline: converts call-recording PCM to a
 * temporary WAV file, then passes it to the system recognizer via a FileProvider
 * URI. Xiaomi's on-device recognizer accepts file input through the non-standard
 * EXTRA_AUDIO_SOURCE extra; other OEM implementations may fall back to no-op.
 *
 * Requires RECORD_AUDIO permission (added to the manifest alongside this class).
 * The 60-second latch timeout is generous — HyperOS offline recognition of a
 * typical 2–5 minute call takes 5–15 s.
 */
object OnDeviceSpeechRecognizer {

    private const val TAG = "OnDeviceASR"
    private const val LATCH_TIMEOUT_SEC = 75L

    /** Transcribe [pcm] (16 kHz mono floats) using the system speech recognizer.
     *  Returns the transcript string, or null if recognition failed or unsupported. */
    fun transcribe(context: Context, pcm: FloatArray, language: String = "hi-IN"): String? {
        if (!SpeechRecognizer.isRecognitionAvailable(context)) {
            Log.d(TAG, "SpeechRecognizer not available on this device")
            return null
        }

        val wavFile = writePcmToWav(context, pcm) ?: return null
        val fileUri: Uri = try {
            FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", wavFile)
        } catch (e: Exception) {
            Log.w(TAG, "FileProvider failed: ${e.message} — trying plain file URI")
            Uri.fromFile(wavFile)
        }

        val latch = CountDownLatch(1)
        var result: String? = null

        Handler(Looper.getMainLooper()).post {
            val recognizer: SpeechRecognizer = if (
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
                SpeechRecognizer.isOnDeviceRecognitionAvailable(context)
            ) {
                Log.d(TAG, "Using on-device recognizer (HyperOS AI)")
                SpeechRecognizer.createOnDeviceSpeechRecognizer(context)
            } else {
                Log.d(TAG, "Using default system recognizer")
                SpeechRecognizer.createSpeechRecognizer(context)
            }

            recognizer.setRecognitionListener(object : RecognitionListener {
                override fun onResults(results: Bundle) {
                    val strings = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                    result = strings?.firstOrNull()
                    Log.d(TAG, "Recognition OK: ${result?.take(80)}")
                    recognizer.destroy()
                    wavFile.delete()
                    latch.countDown()
                }
                override fun onError(error: Int) {
                    Log.w(TAG, "Recognition error $error (${errorName(error)})")
                    recognizer.destroy()
                    wavFile.delete()
                    latch.countDown()
                }
                override fun onReadyForSpeech(params: Bundle?) {}
                override fun onBeginningOfSpeech() {}
                override fun onRmsChanged(rmsdB: Float) {}
                override fun onBufferReceived(buffer: ByteArray?) {}
                override fun onEndOfSpeech() {}
                override fun onPartialResults(partialResults: Bundle?) {}
                override fun onEvent(eventType: Int, params: Bundle?) {}
            })

            val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "$language,en-IN")
                putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                }
                // Non-standard extra: Xiaomi/MIUI SpeechRecognizer accepts a content
                // URI here and recognizes from the audio file instead of the microphone.
                // Falls back to a no-op on OEMs that don't support it.
                putExtra("android.speech.extra.AUDIO_SOURCE", fileUri)
                putExtra("android.speech.extra.AUDIO_SOURCE_LENGTH_HINT", wavFile.length())
            }
            try {
                recognizer.startListening(intent)
            } catch (e: Exception) {
                Log.w(TAG, "startListening failed: ${e.message}")
                recognizer.destroy()
                wavFile.delete()
                latch.countDown()
            }
        }

        val finished = latch.await(LATCH_TIMEOUT_SEC, TimeUnit.SECONDS)
        if (!finished) Log.w(TAG, "Timed out after ${LATCH_TIMEOUT_SEC}s")
        return result
    }

    // ── PCM → WAV writer ───────────────────────────────────────────────────────

    private fun writePcmToWav(context: Context, pcm: FloatArray): File? {
        return try {
            val outDir = context.cacheDir
            val wavFile = File(outDir, "asr_input_${System.currentTimeMillis()}.wav")
            val pcmBytes = ByteArray(pcm.size * 2)
            for (i in pcm.indices) {
                val sample = (pcm[i] * 32767).toInt().coerceIn(-32768, 32767).toShort()
                pcmBytes[i * 2] = (sample.toInt() and 0xFF).toByte()
                pcmBytes[i * 2 + 1] = (sample.toInt() shr 8 and 0xFF).toByte()
            }
            writeWavFile(wavFile, pcmBytes, sampleRate = 16000, channels = 1, bitsPerSample = 16)
            wavFile
        } catch (e: Exception) {
            Log.w(TAG, "PCM→WAV conversion failed: ${e.message}")
            null
        }
    }

    private fun writeWavFile(
        file: File, pcmData: ByteArray,
        sampleRate: Int, channels: Int, bitsPerSample: Int
    ) {
        val byteRate = sampleRate * channels * bitsPerSample / 8
        val blockAlign = (channels * bitsPerSample / 8).toShort()
        val dataSize = pcmData.size
        val chunkSize = 36 + dataSize

        RandomAccessFile(file, "rw").use { raf ->
            raf.write("RIFF".toByteArray())
            raf.writeIntLE(chunkSize)
            raf.write("WAVE".toByteArray())
            raf.write("fmt ".toByteArray())
            raf.writeIntLE(16)              // sub-chunk size
            raf.writeShortLE(1)             // PCM format
            raf.writeShortLE(channels.toShort())
            raf.writeIntLE(sampleRate)
            raf.writeIntLE(byteRate)
            raf.writeShortLE(blockAlign)
            raf.writeShortLE(bitsPerSample.toShort())
            raf.write("data".toByteArray())
            raf.writeIntLE(dataSize)
            raf.write(pcmData)
        }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun RandomAccessFile.writeIntLE(value: Int) {
        write(value and 0xFF)
        write(value shr 8 and 0xFF)
        write(value shr 16 and 0xFF)
        write(value shr 24 and 0xFF)
    }
    private fun RandomAccessFile.writeShortLE(value: Short) {
        write(value.toInt() and 0xFF)
        write(value.toInt() shr 8 and 0xFF)
    }

    private fun errorName(code: Int): String = when (code) {
        SpeechRecognizer.ERROR_AUDIO -> "ERROR_AUDIO"
        SpeechRecognizer.ERROR_CLIENT -> "ERROR_CLIENT"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "NO_PERMISSION"
        SpeechRecognizer.ERROR_NETWORK -> "ERROR_NETWORK"
        SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "NETWORK_TIMEOUT"
        SpeechRecognizer.ERROR_NO_MATCH -> "NO_MATCH"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "RECOGNIZER_BUSY"
        SpeechRecognizer.ERROR_SERVER -> "SERVER_ERROR"
        SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "SPEECH_TIMEOUT"
        else -> "UNKNOWN_$code"
    }
}
