package com.taskmind.notificationlistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import android.util.Log

/**
 * Foreground service that:
 *  1. Hosts the persistent non-dismissible task summary notification.
 *  2. Keeps the process alive so Headless JS tasks fire reliably.
 *
 * The notification uses FLAG_ONGOING_EVENT | FLAG_NO_CLEAR so it cannot
 * be swiped away as long as there are pending tasks.
 */
class TaskMindForegroundService : Service() {

    override fun onCreate() {
        super.onCreate()
        isRunning = true
        Log.d(TAG, "TaskMindForegroundService created")
        ensureNotificationChannel(this)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        Log.d(TAG, "TaskMindForegroundService onStartCommand")
        val notification = buildNotification(
            context = this,
            pendingCount = currentPendingCount,
            urgentCount = currentUrgentCount,
            topTaskText = currentTopTaskText,
            secondTaskText = currentSecondTaskText,
        )
        startForeground(NOTIFICATION_ID, notification)
        return START_STICKY
    }

    override fun onDestroy() {
        isRunning = false
        Log.d(TAG, "TaskMindForegroundService destroyed")
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        private const val TAG = "TaskMindFgService"
        const val NOTIFICATION_ID = 1001
        const val CHANNEL_ID = "persistent_status"
        const val CHANNEL_NAME = "Pending Tasks Status"

        @Volatile
        var isRunning = false
            private set

        // Cached notification state — updated via updateNotification()
        private var currentPendingCount = 0
        private var currentUrgentCount = 0
        private var currentTopTaskText = ""
        private var currentSecondTaskText: String? = null

        fun updateNotification(
            context: Context,
            pendingCount: Int,
            urgentCount: Int,
            topTaskText: String,
            secondTaskText: String?,
        ) {
            currentPendingCount = pendingCount
            currentUrgentCount = urgentCount
            currentTopTaskText = topTaskText
            currentSecondTaskText = secondTaskText

            if (!isRunning) return

            ensureNotificationChannel(context)
            val nm = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.notify(
                NOTIFICATION_ID,
                buildNotification(context, pendingCount, urgentCount, topTaskText, secondTaskText)
            )
        }

        fun hideNotification(context: Context) {
            currentPendingCount = 0
            val nm = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            // We cannot truly remove a foreground service notification while the service runs,
            // but we update the text to reflect zero tasks.
            nm.notify(
                NOTIFICATION_ID,
                buildNotification(context, 0, 0, "", null)
            )
        }

        private fun ensureNotificationChannel(context: Context) {
            val nm = context.getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            if (nm.getNotificationChannel(CHANNEL_ID) != null) return
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Shows pending task summary. Cannot be dismissed while tasks are pending."
                setShowBadge(false)
                enableLights(false)
                enableVibration(false)
                setSound(null, null)
            }
            nm.createNotificationChannel(channel)
        }

        private fun buildNotification(
            context: Context,
            pendingCount: Int,
            urgentCount: Int,
            topTaskText: String,
            secondTaskText: String?,
        ): Notification {
            // Launch app intent
            val launchIntent = context.packageManager
                .getLaunchIntentForPackage(context.packageName)
                ?.apply { flags = Intent.FLAG_ACTIVITY_SINGLE_TOP }
            val launchPi = PendingIntent.getActivity(
                context, 0, launchIntent ?: Intent(),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            // "Done Top" quick action
            val doneTopIntent = Intent(context, QuickActionReceiver::class.java).apply {
                action = QuickActionReceiver.ACTION_DONE_TOP
            }
            val doneTopPi = PendingIntent.getBroadcast(
                context, 1, doneTopIntent,
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
            )

            val titleText = if (pendingCount == 0) {
                "TaskMind — All clear!"
            } else {
                "TaskMind — $pendingCount pending${if (urgentCount > 0) " • $urgentCount urgent" else ""}"
            }

            val bigTextBody = buildString {
                if (topTaskText.isNotBlank()) appendLine("• $topTaskText")
                if (!secondTaskText.isNullOrBlank()) appendLine("• $secondTaskText")
                if (pendingCount == 0) append("No pending tasks.")
            }.trimEnd()

            return Notification.Builder(context, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_dialog_info) // replaced by app icon post-prebuild
                .setContentTitle(titleText)
                .setContentText(if (topTaskText.isNotBlank()) topTaskText else "Tap to open TaskMind")
                .setStyle(Notification.BigTextStyle().bigText(bigTextBody))
                .setContentIntent(launchPi)
                .setOngoing(true)
                .addAction(
                    Notification.Action.Builder(
                        null,
                        "Open",
                        launchPi
                    ).build()
                )
                .addAction(
                    Notification.Action.Builder(
                        null,
                        "Done Top",
                        doneTopPi
                    ).build()
                )
                // FLAG_NO_CLEAR + FLAG_ONGOING_EVENT make it non-dismissible
                .also { builder ->
                    @Suppress("DEPRECATION")
                    builder.setFlag(
                        Notification.FLAG_NO_CLEAR or Notification.FLAG_ONGOING_EVENT,
                        true
                    )
                }
                .build()
        }
    }
}
