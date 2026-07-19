package expo.modules.notificationlistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS notification pipeline (`handleNotification`) in a background JS
 * context when the app's UI/JS is not alive. The native NotificationListener
 * service dispatches to this only when there is no active JS listener.
 * The registered JS task name is "TaskMindNotificationHandler" (see index.js).
 *
 * Started via startForegroundService() so MIUI/HyperOS cannot block the start.
 * We call startForeground() immediately in onStartCommand — before super — to
 * satisfy Android's 5-second FGS contract, then drop back to non-foreground
 * after the JS pipeline timeout so the notification is brief.
 */
class TaskMindHeadlessTaskService : HeadlessJsTaskService() {

    companion object {
        private const val NOTIFICATION_ID = 1004
        private const val CHANNEL_ID = "taskmind_bg_pipeline"
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel()
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID, buildNotification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
                )
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
        } catch (_: Throwable) {
            // If foreground elevation fails the task still runs; the 60 s
            // pipeline budget usually completes well within the ANR window.
        }
        val result = super.onStartCommand(intent, flags, startId)
        // Remove the foreground state once the JS task timeout elapses so we
        // don't hold the dataSync budget longer than needed.
        android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
            try { stopForeground(STOP_FOREGROUND_REMOVE) } catch (_: Throwable) {}
        }, 65_000L)
        return result
    }

    override fun getTaskConfig(intent: Intent): HeadlessJsTaskConfig? {
        val extras = intent.extras ?: return null
        return HeadlessJsTaskConfig(
            "TaskMindNotificationHandler",
            Arguments.fromBundle(extras),
            60_000L, // generous timeout: AI call + DB writes
            true // allowedInForeground — safe; we only start this when JS is dead
        )
    }

    private fun buildNotification(): Notification =
        Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("TaskMind")
            .setContentText("Checking notification for tasks…")
            .setOngoing(true)
            .setShowWhen(false)
            .build()

    private fun ensureChannel() {
        getSystemService(NotificationManager::class.java).createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Background task processing",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Shown briefly while a notification is being analysed."
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
        )
    }
}
