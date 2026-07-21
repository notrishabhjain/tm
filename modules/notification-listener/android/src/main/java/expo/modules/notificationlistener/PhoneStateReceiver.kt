package expo.modules.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.telephony.TelephonyManager
import android.util.Log

/**
 * Static BroadcastReceiver for android.intent.action.PHONE_STATE.
 *
 * This provides a SERVICE-INDEPENDENT fallback for call transcription: it fires
 * even when TaskMindForegroundService has been killed by OEM battery optimisers
 * (MIUI, ColorOS, FunTouch OS, One UI aggressive mode), guaranteeing that every
 * completed call still gets a transcription attempt.
 *
 * android.intent.action.PHONE_STATE is exempted from Android 8+ background-receiver
 * restrictions (see the Android implicit-broadcasts exceptions list), so declaring
 * it statically in the manifest is safe and effective.
 *
 * State tracking: TelephonyManager extras give us the current state, but we need
 * to remember the previous state (OFFHOOK) across two separate broadcast deliveries.
 * Instance variables can't survive between deliveries, so we use SharedPreferences
 * as the persistence layer.
 */
class PhoneStateReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "PhoneStateReceiver"
        private const val PREFS = "taskmind_prefs"
        private const val KEY_WAS_OFFHOOK = "phone_receiver_was_offhook"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TelephonyManager.ACTION_PHONE_STATE_CHANGED) return

        val state = intent.getStringExtra(TelephonyManager.EXTRA_STATE) ?: return
        val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

        when (state) {
            TelephonyManager.EXTRA_STATE_OFFHOOK -> {
                // Call picked up — remember this so we can detect when it ends.
                prefs.edit().putBoolean(KEY_WAS_OFFHOOK, true).apply()
                Log.d(TAG, "Call started (OFFHOOK)")
            }

            TelephonyManager.EXTRA_STATE_IDLE -> {
                val wasOffhook = prefs.getBoolean(KEY_WAS_OFFHOOK, false)
                prefs.edit().putBoolean(KEY_WAS_OFFHOOK, false).apply()

                if (!wasOffhook) return // Was only ringing, not answered — skip.

                Log.d(TAG, "Call ended (IDLE after OFFHOOK) — starting transcription service")

                if (!prefs.getBoolean("call_transcription_enabled", false)) {
                    Log.d(TAG, "Call transcription disabled — skipping")
                    return
                }

                CallRecordStore.logActivity(
                    context, "call", "Call", "TRIGGER",
                    "Call ended — PhoneStateReceiver fired, starting transcription"
                )

                // Flag the pending call FIRST: if the service start below is
                // blocked (MIUI/HyperOS autostart off, background restrictions),
                // the recovery sweep — triggered from the notification listener
                // or the next app open — picks this recording up.
                prefs.edit()
                    .putLong(CallTranscriptionService.KEY_PENDING_CALL_SCAN, System.currentTimeMillis())
                    .apply()

                try {
                    // Start immediately — the service's retry loop (3 + 6 + 10 + 20 s)
                    // handles the recording file not yet being flushed to disk.
                    context.startForegroundService(
                        Intent(context, CallTranscriptionService::class.java)
                    )
                } catch (e: Exception) {
                    Log.w(TAG, "Failed to start CallTranscriptionService: ${e.message}")
                    CallRecordStore.logActivity(
                        context, "call", "Call", "ERROR",
                        "Could not start transcription service — watchdog will retry: ${e.message}"
                    )
                }
            }
        }
    }
}
