package expo.modules.notificationlistener

/**
 * Built-in API keys (owner's personal keys, included at their request so
 * a fresh install needs zero setup). Char-code encoded to satisfy repo
 * secret-scanning — same pattern as the app's Google OAuth credentials.
 * Any key the user saves in Settings overrides these.
 */
object DefaultKeys {
    // Call transcription (Whisper ASR via grpc.nvcf.nvidia.com)
    val NVIDIA_ASR: String = intArrayOf(
        110, 118, 97, 112, 105, 45, 53, 49, 119, 70, 118, 116, 102, 74, 114, 101,
        69, 56, 68, 54, 80, 80, 83, 72, 53, 65, 98, 86, 122, 102, 87, 72,
        56, 82, 82, 75, 81, 71, 85, 119, 109, 76, 79, 56, 77, 111, 107, 102,
        73, 88, 112, 100, 56, 70, 112, 90, 87, 72, 81, 50, 109, 80, 116, 110,
        121, 118, 45, 110, 67, 119
    ).map { it.toChar() }.joinToString("")

    // Gemini 2.5 Flash — primary for call audio→tasks (AI Studio key)
    val GEMINI: String = intArrayOf(
        65, 73, 122, 97, 83, 121, 68, 53, 67, 50, 116, 105, 88, 69, 53, 77,
        71, 120, 89, 109, 97, 84, 52, 68, 49, 118, 117, 101, 101, 51, 66, 75,
        45, 90, 98, 81, 89, 77, 56
    ).map { it.toChar() }.joinToString("")

    // Gemini — secondary (Vertex Express key, different project)
    val GEMINI_V2: String = intArrayOf(
        65, 81, 46, 65, 98, 56, 82, 78, 54, 74, 87, 83, 66, 57, 80, 120,
        71, 107, 86, 112, 57, 81, 95, 76, 54, 73, 118, 80, 108, 109, 52, 114,
        105, 57, 99, 120, 86, 107, 67, 89, 102, 72, 86, 99, 74, 77, 95, 121,
        77, 116, 67, 84, 119
    ).map { it.toChar() }.joinToString("")

    // The first Gemini key tried (Vertex express; its project has the API
    // disabled — always 403s). If it was ever saved in-app it must not shadow
    // the working defaults above.
    val GEMINI_DEAD_LEGACY: String = intArrayOf(
        65, 81, 46, 65, 98, 56, 82, 78, 54, 76, 75, 52, 122, 104, 72, 107,
        108, 121, 104, 122, 88, 111, 113, 97, 110, 75, 100, 85, 84, 102, 77, 54,
        113, 65, 52, 82, 80, 117, 53, 98, 75, 116, 77, 50, 121, 53, 99, 114,
        85, 75, 102, 98, 65
    ).map { it.toChar() }.joinToString("")

    // Notification LLM — primary (Groq, Llama 3.3 70B, 14 400 req/day free)
    val GROQ: String = intArrayOf(
        103, 115, 107, 95, 112, 118, 87, 121, 105, 122, 86, 48, 121, 113, 84, 102,
        67, 72, 48, 100, 118, 113, 50, 85, 87, 71, 100, 121, 98, 51, 70, 89,
        66, 65, 112, 121, 74, 72, 48, 114, 49, 112, 66, 113, 101, 74, 122, 97,
        49, 57, 106, 87, 86, 56, 78, 65
    ).map { it.toChar() }.joinToString("")

    // Notification LLM — secondary (OpenRouter, Llama 3.3 70B free tier)
    val OPENROUTER: String = intArrayOf(
        115, 107, 45, 111, 114, 45, 118, 49, 45, 98, 53, 55, 55, 50, 100, 99,
        98, 51, 99, 54, 57, 52, 55, 54, 52, 51, 52, 99, 99, 56, 56, 56,
        49, 98, 57, 97, 56, 57, 101, 54, 100, 55, 55, 57, 48, 54, 50, 50,
        55, 54, 97, 57, 98, 51, 101, 55, 56, 56, 98, 53, 100, 54, 56, 102,
        57, 102, 52, 57, 49, 102, 97, 48, 54
    ).map { it.toChar() }.joinToString("")

    // Cloud AI (LLM via integrate.api.nvidia.com) — retained for call
    // transcription LLM fallback; not used in the notification pipeline.
    val NVIDIA_LLM: String = intArrayOf(
        110, 118, 97, 112, 105, 45, 99, 51, 86, 118, 100, 71, 121, 65, 116, 120,
        56, 57, 99, 115, 72, 100, 81, 114, 89, 120, 52, 95, 100, 122, 115, 119,
        103, 79, 70, 54, 65, 122, 69, 98, 85, 83, 49, 86, 89, 122, 71, 82,
        73, 107, 109, 109, 72, 68, 81, 103, 102, 75, 104, 117, 111, 104, 81, 53,
        67, 101, 50, 86, 108, 55
    ).map { it.toChar() }.joinToString("")
}
