package expo.modules.notificationlistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log

/**
 * Minimal foreground service: keeps the process favoured by the OS so the
 * notification-listener binding survives and the call-state monitor stays
 * registered. Shows one static low-priority notification — TaskMind v2 has no
 * in-app task list, so there is nothing dynamic to display here.
 */
class TaskMindForegroundService : Service() {

    companion object {
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "taskmind_persistent_status"

        @Volatile
        var isRunning = false
    }

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        isRunning = true
        CallStateMonitor.start(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                startForeground(
                    NOTIFICATION_ID, buildNotification(),
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
                )
            } else {
                startForeground(NOTIFICATION_ID, buildNotification())
            }
        } catch (t: Throwable) {
            // Must never crash the app (a crash kills the notification listener).
            Log.w("TaskMindFgs", "startForeground denied: ${t.message}")
            stopSelf()
            return START_NOT_STICKY
        }
        // Re-attempt every time the service starts in case READ_PHONE_STATE was
        // not yet granted during onCreate (idempotent if already registered).
        CallStateMonitor.start(this)
        return START_STICKY
    }

    private fun buildNotification(): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val pi = launchIntent?.let {
            PendingIntent.getActivity(
                this, 0, it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
            )
        }
        return Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("TaskMind")
            .setContentText("Watching notifications & calls for tasks")
            .setOngoing(true)
            .setShowWhen(false)
            .apply { if (pi != null) setContentIntent(pi) }
            .build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "TaskMind Status",
            NotificationManager.IMPORTANCE_MIN
        ).apply {
            description = "Keeps TaskMind capturing in the background."
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
            setSound(null, null)
        }
        getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        CallStateMonitor.stop()
    }
}
