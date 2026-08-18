package expo.modules.notificationlistener

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Toast

/**
 * Receives a transcript shared from another app — in practice, the phone's
 * recorder app sharing the text of a transcribed call.
 *
 * Why a share target rather than reading the file from disk: on HyperOS the
 * Recorder transcribes with Xiaomi's cloud AI, but where (or whether) it writes
 * that text to shared storage is undocumented and varies by build. Sharing is
 * the one route the recorder is guaranteed to offer, needs no storage
 * permission, and cannot break when Xiaomi moves a directory. The filesystem
 * search in CallTranscriptSidecar remains as the automatic path for builds that
 * do write a readable file; this is the path that always works.
 *
 * The activity itself has no UI: it stashes the text, opens the app to review
 * and confirm it, and finishes. Doing the extraction here would mean building a
 * second task-creation path in Kotlin, which is exactly what the single JS
 * intake funnel exists to avoid.
 */
class TranscriptShareActivity : Activity() {

    companion object {
        private const val TAG = "TranscriptShare"
        private const val PREFS = "taskmind_prefs"

        /** Text awaiting review, written here and consumed by the JS import screen. */
        const val KEY_PENDING_SHARE = "pending_shared_transcript"
        const val KEY_PENDING_SHARE_AT = "pending_shared_transcript_at"

        /**
         * Guard against a paste of something enormous. A long call transcript is
         * a few tens of KB; far beyond that is not a transcript, and holding it
         * in preferences would bloat every read of that file.
         */
        private const val MAX_SHARE_CHARS = 200_000

        /** Reads and clears the pending share. Returns empty string when none. */
        fun consume(context: Context): String {
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val text = prefs.getString(KEY_PENDING_SHARE, "").orEmpty()
            if (text.isNotEmpty()) {
                prefs.edit().remove(KEY_PENDING_SHARE).remove(KEY_PENDING_SHARE_AT).apply()
            }
            return text
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        try {
            handleShare(intent)
        } catch (t: Throwable) {
            // A share that cannot be handled must not crash into the user's face;
            // they are mid-task in another app.
            Log.w(TAG, "Share handling failed: ${t.message}")
            toast("TaskMind could not read that transcript")
        }
        finish()
    }

    private fun handleShare(intent: Intent?) {
        if (intent == null || intent.action != Intent.ACTION_SEND) return

        val shared = (intent.getCharSequenceExtra(Intent.EXTRA_TEXT) ?: "").toString().trim()
        if (shared.isEmpty()) {
            toast("Nothing to import — that share carried no text")
            return
        }
        if (shared.length > MAX_SHARE_CHARS) {
            toast("That text is too long to import")
            return
        }

        getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY_PENDING_SHARE, shared)
            .putLong(KEY_PENDING_SHARE_AT, System.currentTimeMillis())
            .apply()

        // Bring the app forward so the user can confirm which call this belongs
        // to before anything is written to their task list.
        val launch = packageManager.getLaunchIntentForPackage(packageName)
        if (launch != null) {
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
            startActivity(launch)
        } else {
            // No launcher activity resolvable — the text is still stored, so the
            // next time the app opens it will be picked up.
            toast("Transcript saved — open TaskMind to import it")
        }
    }

    private fun toast(message: String) {
        try {
            Toast.makeText(applicationContext, message, Toast.LENGTH_SHORT).show()
        } catch (_: Throwable) { }
    }
}
