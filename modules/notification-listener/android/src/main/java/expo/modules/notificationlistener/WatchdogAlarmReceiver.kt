package expo.modules.notificationlistener

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log

/**
 * Periodic watchdog that fires every ~5 minutes via AlarmManager.
 *
 * Responsibilities:
 *  1. Restart TaskMindForegroundService if OEM killed it (without this, the
 *     next restart only happens on the next notification — a chicken-and-egg
 *     problem on MIUI where the headless start is also blocked).
 *  2. Retry CallTranscriptionService if a pending call scan was flagged but
 *     the initial service start was blocked by OEM restrictions.
 *
 * Uses setAndAllowWhileIdle() (no SCHEDULE_EXACT_ALARM permission needed)
 * which fires within a ~15-minute Doze window — acceptable for a watchdog
 * that only plugs OEM-killed service gaps, not for real-time triggering.
 *
 * Each firing reschedules the next alarm so the chain survives indefinitely.
 */
class WatchdogAlarmReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "WatchdogAlarm"
        private const val ACTION = "com.taskmind.WATCHDOG_TICK"
        private const val REQUEST_CODE = 9901

        // Gap between watchdog ticks. setAndAllowWhileIdle has a minimum of
        // ~9 minutes in Doze; we request 5 so it fires as often as the OS allows.
        private const val INTERVAL_MS = 5 * 60 * 1000L

        fun schedule(context: Context) {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            val pi = buildPendingIntent(context)
            val triggerAt = System.currentTimeMillis() + INTERVAL_MS
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                } else {
                    am.set(AlarmManager.RTC_WAKEUP, triggerAt, pi)
                }
                Log.d(TAG, "Watchdog alarm scheduled for ${INTERVAL_MS / 1000}s from now")
            } catch (e: Exception) {
                Log.w(TAG, "Failed to schedule watchdog: ${e.message}")
            }
        }

        fun cancel(context: Context) {
            val am = context.getSystemService(AlarmManager::class.java) ?: return
            am.cancel(buildPendingIntent(context))
        }

        private fun buildPendingIntent(context: Context): PendingIntent {
            val intent = Intent(context, WatchdogAlarmReceiver::class.java).apply {
                action = ACTION
            }
            return PendingIntent.getBroadcast(
                context, REQUEST_CODE, intent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )
        }
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != ACTION) return
        Log.d(TAG, "Watchdog tick")

        // Always reschedule first — if anything below crashes we still wake up again.
        schedule(context)

        val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)

        // 1. Restart the foreground service if OEM killed it.
        if (!TaskMindForegroundService.isRunning) {
            Log.d(TAG, "FGS not running — restarting")
            try {
                context.startForegroundService(Intent(context, TaskMindForegroundService::class.java))
            } catch (e: Exception) {
                Log.w(TAG, "FGS restart failed: ${e.message}")
            }
        }

        // 2. Recovery sweep: always start when call transcription is enabled so
        //    new recordings are processed even when ALL three triggers are blocked
        //    (PhoneStateReceiver, CallStateMonitor, ContentObserver) — the alarm fires
        //    every ~5 min and is the last-resort safety net. The service is cheap to
        //    start when nothing is found (filesystem scan only, no network call).
        if (prefs.getBoolean("call_transcription_enabled", false)) {
            Log.d(TAG, "Watchdog sweep — checking for unprocessed call recordings")
            try {
                context.startForegroundService(
                    Intent(context, CallTranscriptionService::class.java)
                        .putExtra(CallTranscriptionService.EXTRA_MODE, CallTranscriptionService.MODE_SWEEP)
                )
            } catch (e: Exception) {
                Log.w(TAG, "CallTranscriptionService start failed: ${e.message}")
            }
        }

        // 3. Drain any notifications that were queued because the headless start
        //    was blocked (Autostart off or OEM killed the service). If the listener
        //    is bound but the RN bridge isn't alive, drainPendingQueue() now
        //    dispatches each item as a fresh headless task instead of silently dropping.
        TaskMindNotificationListenerService.triggerDrain()
    }
}
