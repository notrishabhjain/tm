package expo.modules.notificationlistener

import android.util.Log

/**
 * Thin JNI bridge to the native whisper.cpp build (see
 * android/src/main/cpp/whisper_jni.cpp). The native library only links a real
 * whisper.cpp if one was checked out into android/src/main/cpp/whisper.cpp
 * before building (see settings screen for instructions) — otherwise the
 * stub implementation is built, which loads fine but every call returns an
 * error code so callers can detect "engine not built" vs "model missing".
 */
object WhisperJNI {
    private const val TAG = "WhisperJNI"

    @Volatile
    private var loaded = false
    @Volatile
    private var loadFailed = false

    @Synchronized
    fun ensureLoaded(): Boolean {
        if (loaded) return true
        if (loadFailed) return false
        return try {
            System.loadLibrary("whisper_jni")
            loaded = true
            true
        } catch (e: UnsatisfiedLinkError) {
            Log.w(TAG, "libwhisper_jni.so not available: ${e.message}")
            loadFailed = true
            false
        }
    }

    /** Returns 0 on failure, otherwise an opaque context pointer. */
    external fun initContext(modelPath: String): Long

    external fun freeContext(contextPtr: Long)

    /** Returns 0 on success, non-zero on failure. */
    external fun fullTranscribe(
        contextPtr: Long,
        numThreads: Int,
        audioData: FloatArray,
        language: String
    ): Int

    external fun getTextSegmentCount(contextPtr: Long): Int

    external fun getTextSegment(contextPtr: Long, index: Int): String

    /** True if this build links a real whisper.cpp (not the stub). */
    external fun isReal(): Boolean
}
