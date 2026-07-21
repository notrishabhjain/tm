package expo.modules.notificationlistener

import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.telephony.PhoneStateListener
import android.telephony.TelephonyCallback
import android.telephony.TelephonyManager
import android.util.Log
import androidx.core.content.ContextCompat

/**
 * Watches call state and, when a call ends, starts CallTranscriptionService
 * after a short delay (giving the phone's recorder time to finish writing
 * the file). Replaces the MacroDroid "Call Ended" trigger.
 */
object CallStateMonitor {
    private const val TAG = "CallStateMonitor"
    private const val PREFS = "taskmind_prefs"

    // Persisted across FGS restarts so a call in progress when the FGS is
    // killed (OEM battery manager) is still transcribed when the call ends.
    private const val KEY_WAS_OFFHOOK = "call_monitor_was_offhook"

    // Wait for the recorder to finish writing before scanning for the file.
    private const val TRANSCRIBE_DELAY_MS = 15_000L

    private val handler = Handler(Looper.getMainLooper())
    private var registered = false

    /** True once the telephony callback has been successfully registered. */
    fun isRegistered(): Boolean = registered

    private var telephonyManager: TelephonyManager? = null
    private var legacyListener: PhoneStateListener? = null
    private var modernCallback: TelephonyCallback? = null

    @Suppress("DEPRECATION")
    fun start(context: Context) {
        if (registered) return

        if (ContextCompat.checkSelfPermission(context, android.Manifest.permission.READ_PHONE_STATE)
            != PackageManager.PERMISSION_GRANTED
        ) {
            Log.d(TAG, "READ_PHONE_STATE not granted — call transcription trigger disabled")
            return
        }

        val tm = context.getSystemService(TelephonyManager::class.java) ?: return
        telephonyManager = tm

        // If we're registering mid-call (e.g. the FGS was killed and restarted
        // while a call was in progress), mark wasOffhook immediately so the
        // IDLE transition that follows the call end is not silently skipped.
        @Suppress("DEPRECATION")
        if (tm.callState == TelephonyManager.CALL_STATE_OFFHOOK) {
            setWasOffhook(context, true)
            Log.d(TAG, "Registered mid-call — wasOffhook set to true")
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val callback = object : TelephonyCallback(), TelephonyCallback.CallStateListener {
                override fun onCallStateChanged(state: Int) {
                    handleState(context, state)
                }
            }
            modernCallback = callback
            tm.registerTelephonyCallback(context.mainExecutor, callback)
        } else {
            val listener = object : PhoneStateListener() {
                override fun onCallStateChanged(state: Int, phoneNumber: String?) {
                    handleState(context, state)
                }
            }
            legacyListener = listener
            tm.listen(listener, PhoneStateListener.LISTEN_CALL_STATE)
        }

        registered = true
    }

    @Suppress("DEPRECATION")
    fun stop() {
        val tm = telephonyManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            modernCallback?.let { tm.unregisterTelephonyCallback(it) }
        } else {
            legacyListener?.let { tm.listen(it, PhoneStateListener.LISTEN_NONE) }
        }
        modernCallback = null
        legacyListener = null
        telephonyManager = null
        registered = false
        // Do NOT clear wasOffhook here — the FGS may be stopped mid-call
        // (OEM kills it) and we need the persisted flag to survive the restart.
    }

    private fun handleState(context: Context, state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> setWasOffhook(context, true)
            TelephonyManager.CALL_STATE_IDLE -> {
                if (getWasOffhook(context)) {
                    setWasOffhook(context, false)
                    scheduleTranscription(context)
                }
            }
        }
    }

    private fun getWasOffhook(context: Context): Boolean =
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .getBoolean(KEY_WAS_OFFHOOK, false)

    private fun setWasOffhook(context: Context, value: Boolean) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putBoolean(KEY_WAS_OFFHOOK, value).apply()
    }

    private fun scheduleTranscription(context: Context) {
        handler.postDelayed({
            val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            if (!prefs.getBoolean("call_transcription_enabled", false)) return@postDelayed
            CallRecordStore.logActivity(
                context, "call", "Call", "TRIGGER",
                "Call ended — CallStateMonitor fired, starting transcription in background"
            )
            // Flag pending before attempting the start — if the start is blocked by
            // OEM restrictions, the watchdog alarm and the notification-listener
            // recovery sweep will pick this up within minutes.
            prefs.edit()
                .putLong(CallTranscriptionService.KEY_PENDING_CALL_SCAN, System.currentTimeMillis())
                .apply()
            try {
                context.startForegroundService(Intent(context, CallTranscriptionService::class.java))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to start CallTranscriptionService: ${e.message}")
                // Pending flag already set — watchdog will retry.
            }
        }, TRANSCRIBE_DELAY_MS)
    }
}
