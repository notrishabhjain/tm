package expo.modules.notificationlistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder

class TaskMindForegroundService : Service() {

    companion object {
        const val ACTION_UPDATE_NOTIFICATION = "com.taskmind.UPDATE_NOTIFICATION"
        const val ACTION_HIDE_NOTIFICATION = "com.taskmind.HIDE_NOTIFICATION"
        const val ACTION_DONE_TOP = "com.taskmind.DONE_TOP"
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "taskmind_persistent_status"

        @Volatile
        var isRunning = false
    }

    private lateinit var notificationManager: NotificationManager
    private var hasStartedForeground = false

    override fun onCreate() {
        super.onCreate()
        notificationManager = getSystemService(NotificationManager::class.java)
        createNotificationChannel()
        isRunning = true
        CallStateMonitor.start(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_UPDATE_NOTIFICATION -> {
                val pendingCount = intent.getIntExtra("pendingCount", 0)
                val urgentCount = intent.getIntExtra("urgentCount", 0)
                val taskTexts = intent.getStringArrayListExtra("taskTexts") ?: arrayListOf()
                saveLastState(pendingCount, urgentCount, taskTexts)
                val notification = buildNotification(pendingCount, urgentCount, taskTexts)
                if (hasStartedForeground) {
                    notificationManager.notify(NOTIFICATION_ID, notification)
                } else {
                    startForeground(NOTIFICATION_ID, notification)
                    hasStartedForeground = true
                }
            }
            ACTION_HIDE_NOTIFICATION -> {
                if (hasStartedForeground) {
                    stopForeground(STOP_FOREGROUND_REMOVE)
                    hasStartedForeground = false
                }
                notificationManager.cancel(NOTIFICATION_ID)
                stopSelf()
                return START_NOT_STICKY
            }
            else -> {
                // Initial start, or system redelivery after process restart
                // (intent == null under START_STICKY) — restore the last known
                // counts instead of wiping the notification back to "0 pending".
                val (pendingCount, urgentCount, taskTexts) = loadLastState()
                val notification = buildNotification(pendingCount, urgentCount, taskTexts)
                startForeground(NOTIFICATION_ID, notification)
                hasStartedForeground = true
            }
        }
        return START_STICKY
    }

    private fun saveLastState(pendingCount: Int, urgentCount: Int, taskTexts: List<String>) {
        getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE).edit()
            .putInt("last_pending_count", pendingCount)
            .putInt("last_urgent_count", urgentCount)
            .putStringSet("last_task_texts", taskTexts.toSet())
            .apply()
    }

    private fun loadLastState(): Triple<Int, Int, ArrayList<String>> {
        val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        val pendingCount = prefs.getInt("last_pending_count", 0)
        val urgentCount = prefs.getInt("last_urgent_count", 0)
        val taskTexts = ArrayList(prefs.getStringSet("last_task_texts", emptySet()) ?: emptySet())
        return Triple(pendingCount, urgentCount, taskTexts)
    }

    private fun buildNotification(
        pendingCount: Int,
        urgentCount: Int,
        taskTexts: List<String>
    ): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
            ?: Intent(Intent.ACTION_MAIN).apply {
                setPackage(packageName)
                addCategory(Intent.CATEGORY_LAUNCHER)
            }
        val launchPI = PendingIntent.getActivity(
            this, 0, launchIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val doneTopIntent = Intent(this, QuickActionReceiver::class.java).apply {
            action = ACTION_DONE_TOP
        }
        val doneTopPI = PendingIntent.getBroadcast(
            this, 1, doneTopIntent,
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val contentText = when {
            pendingCount == 0 -> "No pending tasks"
            urgentCount > 0 -> "$pendingCount pending · $urgentCount urgent"
            else -> "$pendingCount pending tasks"
        }

        val bigText = taskTexts.joinToString("\n") { "• $it" }

        val builder = Notification.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_popup_reminder)
            .setContentTitle("TaskMind")
            .setContentText(contentText)
            .setContentIntent(launchPI)
            .setOngoing(true)
            .setFlag(Notification.FLAG_NO_CLEAR, true)
            .setShowWhen(false)

        if (bigText.isNotBlank()) {
            builder.setStyle(Notification.BigTextStyle().bigText(bigText))
        }

        if (pendingCount > 0) {
            builder.addAction(
                Notification.Action.Builder(null, "Done ✓", doneTopPI).build()
            )
        }

        builder.addAction(
            Notification.Action.Builder(null, "Open", launchPI).build()
        )

        return builder.build()
    }

    private fun createNotificationChannel() {
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Pending Tasks Status",
            NotificationManager.IMPORTANCE_LOW
        ).apply {
            description = "Shows pending task count. Cannot be dismissed while tasks are pending."
            setShowBadge(false)
            enableLights(false)
            enableVibration(false)
            setSound(null, null)
        }
        notificationManager.createNotificationChannel(channel)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        isRunning = false
        CallStateMonitor.stop()
    }
}
