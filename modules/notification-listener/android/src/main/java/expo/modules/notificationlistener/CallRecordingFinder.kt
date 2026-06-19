package expo.modules.notificationlistener

import android.content.Context
import java.io.File

/**
 * Locates the newest call-recording file written by the phone's built-in
 * recorder. Mirrors the logic from the Termux transcribe_call.sh script
 * (settings/call-transcription.tsx) so both paths agree on where recordings
 * live and how staleness/dedup is decided.
 */
object CallRecordingFinder {
    private const val PREFS = "taskmind_prefs"
    private const val KEY_LAST_PROCESSED = "call_transcription_last_recording"
    private const val KEY_CUSTOM_DIR = "call_transcription_custom_dir"

    // Common locations across OEMs for call recordings, checked in order.
    private val DEFAULT_DIRS = listOf(
        // Samsung
        "/storage/emulated/0/Recordings/Record/Call",
        "/storage/emulated/0/Recordings/Call",
        // Generic / AOSP
        "/storage/emulated/0/Recordings/CallRecordings",
        "/storage/emulated/0/Call",
        "/storage/emulated/0/CallRecordings",
        "/storage/emulated/0/CallRecorder",
        // Xiaomi / MIUI
        "/storage/emulated/0/MIUI/sounds/Call",
        "/storage/emulated/0/MIUI/sounds",
        // OnePlus / OxygenOS
        "/storage/emulated/0/Sounds/Call",
        // Pixel / stock Android dialer
        "/storage/emulated/0/Documents/Call Recordings",
        "/storage/emulated/0/Music/Call Recordings",
        // Huawei / EMUI
        "/storage/emulated/0/Recorder/CallRecord",
        // Third-party call recorder apps
        "/storage/emulated/0/CallRecording",
        "/storage/emulated/0/PhoneCallRecordings",
        "/storage/emulated/0/Sounds",
    )

    private val AUDIO_EXTENSIONS = setOf("m4a", "amr", "3gp", "mp3", "wav", "aac", "opus", "ogg")

    /** Max age (ms) for a recording to be considered "from this call".
     *  Extended to 30 min to cover retry attempts inside CallTranscriptionService. */
    private const val MAX_AGE_MS = 30 * 60 * 1000L

    fun candidateDirs(context: Context): List<String> {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val custom = prefs.getString(KEY_CUSTOM_DIR, null)
        return if (!custom.isNullOrBlank()) listOf(custom) + DEFAULT_DIRS else DEFAULT_DIRS
    }

    fun setCustomDir(context: Context, dir: String?) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_CUSTOM_DIR, dir).apply()
    }

    /**
     * Returns the newest recording file from any candidate directory that is
     * younger than [MAX_AGE_MS] and was not already handed off, or null.
     */
    fun findLatestUnprocessed(context: Context): File? {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val lastProcessed = prefs.getString(KEY_LAST_PROCESSED, null)

        var newest: File? = null
        for (dirPath in candidateDirs(context)) {
            val dir = File(dirPath)
            val files = dir.listFiles { f ->
                f.isFile && AUDIO_EXTENSIONS.contains(f.extension.lowercase())
            } ?: continue
            for (f in files) {
                if (newest == null || f.lastModified() > newest.lastModified()) {
                    newest = f
                }
            }
        }

        if (newest == null) return null
        if (newest.absolutePath == lastProcessed) return null

        val age = System.currentTimeMillis() - newest.lastModified()
        if (age > MAX_AGE_MS) return null

        return newest
    }

    fun markProcessed(context: Context, file: File) {
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        prefs.edit().putString(KEY_LAST_PROCESSED, file.absolutePath).apply()
    }
}
