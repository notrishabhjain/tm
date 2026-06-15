package expo.modules.notificationlistener

import android.util.Log

/**
 * Loads the on-device whisper.cpp model and runs transcription on a PCM
 * float buffer (16 kHz, mono, range -1..1 — see AudioDecoder).
 */
object WhisperTranscriber {
    private const val TAG = "WhisperTranscriber"

    sealed class Result {
        data class Success(val text: String) : Result()
        object EngineNotBuilt : Result()
        object ModelMissing : Result()
        object TranscriptionFailed : Result()
    }

    fun transcribe(modelPath: String, pcm: FloatArray, language: String = "auto"): Result {
        if (!WhisperJNI.ensureLoaded() || !WhisperJNI.isReal()) {
            return Result.EngineNotBuilt
        }

        val ctx = WhisperJNI.initContext(modelPath)
        if (ctx == 0L) {
            Log.w(TAG, "Failed to load whisper model from $modelPath")
            return Result.ModelMissing
        }

        try {
            val threads = Runtime.getRuntime().availableProcessors().coerceIn(2, 8)
            val rc = WhisperJNI.fullTranscribe(ctx, threads, pcm, language)
            if (rc != 0) return Result.TranscriptionFailed

            val segments = WhisperJNI.getTextSegmentCount(ctx)
            val sb = StringBuilder()
            for (i in 0 until segments) {
                sb.append(WhisperJNI.getTextSegment(ctx, i))
            }
            val text = sb.toString().trim()
            return if (text.isEmpty()) Result.TranscriptionFailed else Result.Success(text)
        } finally {
            WhisperJNI.freeContext(ctx)
        }
    }
}
