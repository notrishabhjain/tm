package expo.modules.notificationlistener

import android.content.Context
import android.os.Build

/**
 * Picks the transcription engine for call audio.
 *
 * On Xiaomi/Redmi/POCO (HyperOS / MIUI) the on-device speech recogniser is
 * backed by Xiaomi's own AI model — high-quality, works offline, no key needed.
 * We try it FIRST on those devices so calls transcribe even with no network.
 *
 * Priority order on Xiaomi:
 *   1. HyperOS on-device AI (no network, no key — Xiaomi's built-in model)
 *   2. Sarvam (Hindi/Hinglish specialist) — only when a key is configured
 *   3. Groq Whisper Large V3
 *   4. NVIDIA Whisper Large V3
 *
 * Priority order on other OEMs:
 *   1. Sarvam (if key configured)
 *   2. Groq Whisper Large V3
 *   3. NVIDIA Whisper Large V3
 *   4. System on-device recogniser (quality varies; kept as last resort)
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

    private fun isXiaomi(): Boolean {
        val mfr = Build.MANUFACTURER.lowercase()
        val brand = Build.BRAND.lowercase()
        return mfr.contains("xiaomi") || mfr.contains("redmi") || mfr.contains("poco") ||
               brand.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco")
    }

    /** Blocks — call off the main thread. [onLog] narrates engine choice/fallback. */
    fun transcribe(
        context: Context,
        pcm: FloatArray,
        onLog: ((message: String) -> Unit)? = null
    ): Result {
        val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)

        // On Xiaomi/HyperOS: try the built-in on-device AI first — it's the best
        // engine for Indian phone audio and works with no network or API key.
        if (isXiaomi()) {
            onLog?.invoke("HyperOS device detected — trying on-device AI first (no network needed)…")
            val transcript = OnDeviceSpeechRecognizer.transcribe(context, pcm)
            if (!transcript.isNullOrBlank()) {
                onLog?.invoke("HyperOS on-device AI transcription succeeded")
                return Result.Success(transcript, "HyperOS on-device AI")
            }
            onLog?.invoke("HyperOS on-device ASR unavailable on this firmware — trying network engines")
        }

        val sarvam = sarvamKey(context)
        if (sarvam.isNotBlank()) {
            val model = prefs.getString("sarvam_model", null).orEmpty()
                .ifBlank { SarvamAsrClient.DEFAULT_MODEL }
            onLog?.invoke("Transcribing with Sarvam $model (Hindi/Hinglish specialist)…")
            when (val r = SarvamAsrClient.transcribe(sarvam, pcm, model)) {
                is SarvamAsrClient.Result.Success -> return Result.Success(r.text, "Sarvam $model")
                is SarvamAsrClient.Result.Error ->
                    onLog?.invoke("Sarvam failed (${r.message}) — trying Groq Whisper")
                SarvamAsrClient.Result.NoApiKey -> { /* fall through */ }
            }
        }

        val groqKey = prefs.getString("groq_api_key", null).orEmpty().ifBlank { DefaultKeys.GROQ }
        onLog?.invoke("Transcribing with Groq Whisper Large V3…")
        when (val r = GroqAsrClient.transcribe(groqKey, pcm)) {
            is GroqAsrClient.Result.Success -> return Result.Success(r.text, "Groq Whisper Large V3")
            is GroqAsrClient.Result.Error ->
                onLog?.invoke("Groq Whisper failed (${r.message}) — falling back to NVIDIA Whisper")
            GroqAsrClient.Result.NoApiKey ->
                onLog?.invoke("Groq key missing — falling back to NVIDIA Whisper")
        }

        val whisperKey = prefs.getString("nvidia_api_key", null).orEmpty()
            .ifBlank { DefaultKeys.NVIDIA_ASR }
        onLog?.invoke("Transcribing with NVIDIA Whisper Large V3…")
        when (val r = NvidiaAsrClient.transcribe(whisperKey, pcm)) {
            is NvidiaAsrClient.Result.Success -> return Result.Success(r.text, "NVIDIA Whisper Large V3")
            is NvidiaAsrClient.Result.Error ->
                onLog?.invoke("NVIDIA Whisper failed (${r.message}) — trying on-device ASR")
            NvidiaAsrClient.Result.NoApiKey ->
                onLog?.invoke("NVIDIA key missing — trying on-device ASR")
        }

        // For non-Xiaomi OEMs: system on-device recogniser as last resort.
        // Quality varies; on Xiaomi this was already attempted above.
        if (!isXiaomi()) {
            onLog?.invoke("Transcribing with system on-device speech recogniser…")
            val transcript = OnDeviceSpeechRecognizer.transcribe(context, pcm)
            if (!transcript.isNullOrBlank()) {
                return Result.Success(transcript, "On-device ASR")
            }
        }

        return Result.Error("All ASR engines failed — no network and on-device recognition unavailable")
    }
}
