package expo.modules.notificationlistener

import android.content.Context
import android.media.MediaRecorder
import android.os.Build
import android.util.Log
import java.io.File

/**
 * In-app voice note recorder for "speak a task" capture. Records mic audio to
 * an m4a in filesDir; the file is then transcribed with the SAME Whisper ASR
 * used for call recordings (AudioDecoder → NvidiaAsrClient), which handles
 * Hindi/English/Hinglish. One active recording at a time.
 */
object VoiceCapture {
    private const val TAG = "VoiceCapture"
    private const val FILE_NAME = "voice_capture.m4a"

    private var recorder: MediaRecorder? = null
    private var outputFile: File? = null

    @Synchronized
    fun start(context: Context): Boolean {
        stopInternal(discard = true) // clear any stale session
        val file = File(context.filesDir, FILE_NAME)
        return try {
            @Suppress("DEPRECATION")
            val r = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                MediaRecorder(context)
            } else {
                MediaRecorder()
            }
            r.setAudioSource(MediaRecorder.AudioSource.MIC)
            r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            r.setAudioSamplingRate(44_100)
            r.setAudioEncodingBitRate(128_000)
            r.setOutputFile(file.absolutePath)
            r.prepare()
            r.start()
            recorder = r
            outputFile = file
            true
        } catch (e: Exception) {
            Log.w(TAG, "start failed: ${e.message}")
            stopInternal(discard = true)
            false
        }
    }

    /** Stops and returns the recorded file path, or null on failure. */
    @Synchronized
    fun stop(): String? {
        val file = outputFile
        return try {
            recorder?.stop()
            recorder?.release()
            recorder = null
            outputFile = null
            file?.takeIf { it.exists() && it.length() > 0 }?.absolutePath
        } catch (e: Exception) {
            // stop() throws if nothing was actually captured
            Log.w(TAG, "stop failed: ${e.message}")
            stopInternal(discard = true)
            null
        }
    }

    @Synchronized
    fun cancel() {
        stopInternal(discard = true)
    }

    private fun stopInternal(discard: Boolean) {
        try {
            recorder?.stop()
        } catch (_: Exception) { }
        try {
            recorder?.release()
        } catch (_: Exception) { }
        recorder = null
        if (discard) {
            outputFile?.delete()
            outputFile = null
        }
    }
}
