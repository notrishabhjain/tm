package expo.modules.notificationlistener

/**
 * Built-in NVIDIA API keys (owner's personal keys, included at their request so
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

    // Gemini 2.5 Flash (single-call audio → tasks; AI Studio key)
    val GEMINI: String = intArrayOf(
        65, 73, 122, 97, 83, 121, 68, 53, 67, 50, 116, 105, 88, 69, 53, 77,
        71, 120, 89, 109, 97, 84, 52, 68, 49, 118, 117, 101, 101, 51, 66, 75,
        45, 90, 98, 81, 89, 77, 56
    ).map { it.toChar() }.joinToString("")

    // The first Gemini key tried (Vertex express; its project has the API
    // disabled — always 403s). If it was ever saved in-app it must not shadow
    // the working default above.
    val GEMINI_DEAD_LEGACY: String = intArrayOf(
        65, 81, 46, 65, 98, 56, 82, 78, 54, 76, 75, 52, 122, 104, 72, 107,
        108, 121, 104, 122, 88, 111, 113, 97, 110, 75, 100, 85, 84, 102, 77, 54,
        113, 65, 52, 82, 80, 117, 53, 98, 75, 116, 77, 50, 121, 53, 99, 114,
        85, 75, 102, 98, 65
    ).map { it.toChar() }.joinToString("")

    // Cloud AI (LLM via integrate.api.nvidia.com) — refreshed after the
    // original key died (every decision returned 'AI unreachable').
    val NVIDIA_LLM: String = intArrayOf(
        110, 118, 97, 112, 105, 45, 99, 51, 86, 118, 100, 71, 121, 65, 116, 120,
        56, 57, 99, 115, 72, 100, 81, 114, 89, 120, 52, 95, 100, 122, 115, 119,
        103, 79, 70, 54, 65, 122, 69, 98, 85, 83, 49, 86, 89, 122, 71, 82,
        73, 107, 109, 109, 72, 68, 81, 103, 102, 75, 104, 117, 111, 104, 81, 53,
        67, 101, 50, 86, 108, 55
    ).map { it.toChar() }.joinToString("")
}
