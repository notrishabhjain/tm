package expo.modules.notificationlistener

import android.content.Context

/**
 * Picks the transcription engine for call audio.
 *
 * Sarvam (Indian-language/Hinglish specialist) is used whenever a Sarvam API
 * key is configured; NVIDIA Whisper Large V3 is the fallback — both when no
 * Sarvam key is set and when Sarvam fails mid-call. The diagnostics test and
 * the live pipeline share this routing so the test always exercises exactly
 * what production runs.
 */
object AsrEngine {
    sealed class Result {
        data class Success(val text: String, val engine: String) : Result()
        data class Error(val message: String) : Result()
        object NoApiKey : Result()
    }

    fun sarvamKey(context: Context): String =
        context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            .getString("sarvam_api_key", null).orEmpty().trim()

    /** Blocks — call off the main thread. [onLog] narrates engine choice/fallback. */
    fun transcribe(
        context: Context,
        pcm: FloatArray,
        onLog: ((message: String) -> Unit)? = null
    ): Result {
        val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        val sarvam = sarvamKey(context)

        if (sarvam.isNotBlank()) {
            val model = prefs.getString("sarvam_model", null).orEmpty()
                .ifBlank { SarvamAsrClient.DEFAULT_MODEL }
            onLog?.invoke("Transcribing with Sarvam $model (Hindi/Hinglish specialist)…")
            when (val r = SarvamAsrClient.transcribe(sarvam, pcm, model)) {
                is SarvamAsrClient.Result.Success -> return Result.Success(r.text, "Sarvam $model")
                is SarvamAsrClient.Result.Error ->
                    onLog?.invoke("Sarvam failed (${r.message}) — falling back to Whisper")
                SarvamAsrClient.Result.NoApiKey -> { /* fall through to Whisper */ }
            }
        }

        val whisperKey = prefs.getString("nvidia_api_key", null).orEmpty()
            .ifBlank { DefaultKeys.NVIDIA_ASR }
        onLog?.invoke("Transcribing with NVIDIA Whisper Large V3…")
        when (val r = NvidiaAsrClient.transcribe(whisperKey, pcm)) {
            is NvidiaAsrClient.Result.Success -> return Result.Success(r.text, "Whisper Large V3")
            is NvidiaAsrClient.Result.Error ->
                onLog?.invoke("NVIDIA Whisper failed (${r.message}) — falling back to Groq Whisper")
            NvidiaAsrClient.Result.NoApiKey ->
                onLog?.invoke("NVIDIA Whisper key missing — falling back to Groq Whisper")
        }

        val groqKey = prefs.getString("groq_api_key", null).orEmpty().ifBlank { DefaultKeys.GROQ }
        onLog?.invoke("Transcribing with Groq Whisper Large V3…")
        return when (val r = GroqAsrClient.transcribe(groqKey, pcm)) {
            is GroqAsrClient.Result.Success -> Result.Success(r.text, "Groq Whisper Large V3")
            is GroqAsrClient.Result.Error -> Result.Error(r.message)
            GroqAsrClient.Result.NoApiKey -> Result.Error("No ASR key available")
        }
    }
}
