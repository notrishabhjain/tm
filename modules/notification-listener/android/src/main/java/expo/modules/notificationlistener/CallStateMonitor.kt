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

    // Wait for the recorder to finish writing before scanning for the file.
    private const val TRANSCRIBE_DELAY_MS = 15_000L

    private val handler = Handler(Looper.getMainLooper())
    private var registered = false
    private var wasOffhook = false

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
        wasOffhook = false
    }

    private fun handleState(context: Context, state: Int) {
        when (state) {
            TelephonyManager.CALL_STATE_OFFHOOK -> wasOffhook = true
            TelephonyManager.CALL_STATE_IDLE -> {
                if (wasOffhook) {
                    wasOffhook = false
                    scheduleTranscription(context)
                }
            }
        }
    }

    private fun scheduleTranscription(context: Context) {
        handler.postDelayed({
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            if (!prefs.getBoolean("call_transcription_enabled", false)) return@postDelayed
            try {
                context.startForegroundService(Intent(context, CallTranscriptionService::class.java))
            } catch (e: Exception) {
                Log.w(TAG, "Failed to start CallTranscriptionService: ${e.message}")
            }
        }, TRANSCRIBE_DELAY_MS)
    }
}
