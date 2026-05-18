package expo.modules.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import java.util.LinkedHashMap

class TaskMindNotificationListenerService : NotificationListenerService() {

    companion object {
        const val ACTION_REFRESH_FILTER = "com.taskmind.REFRESH_FILTER"
        private const val DEDUP_WINDOW_MS = 5000L
        private const val DEDUP_CACHE_MAX = 100
    }

    private val dedupCache = object : LinkedHashMap<String, Long>(DEDUP_CACHE_MAX, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, Long>) = size > DEDUP_CACHE_MAX
    }

    private var monitoredApps: Set<String> = emptySet()

    private val refreshReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            loadMonitoredApps()
        }
    }

    override fun onCreate() {
        super.onCreate()
        loadMonitoredApps()
        val filter = IntentFilter(ACTION_REFRESH_FILTER)
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(refreshReceiver, filter, RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(refreshReceiver, filter)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        try {
            unregisterReceiver(refreshReceiver)
        } catch (_: Exception) { }
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        val serviceIntent = Intent(this, TaskMindForegroundService::class.java)
        startForegroundService(serviceIntent)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        val packageName = sbn.packageName ?: return

        // Skip our own notifications
        if (packageName == applicationContext.packageName) return

        // Filter by monitored apps (empty set = monitor all)
        if (monitoredApps.isNotEmpty() && !monitoredApps.contains(packageName)) return

        val extras: Bundle = sbn.notification.extras
        val title = extras.getCharSequence("android.title")?.toString() ?: return
        val text = extras.getCharSequence("android.text")?.toString() ?: ""
        val bigText = extras.getCharSequence("android.bigText")?.toString() ?: text

        if (text.isBlank() && bigText.isBlank()) return

        // Deduplication: same (package, title, text) within 5 seconds
        val dedupKey = "$packageName|$title|$text"
        val now = System.currentTimeMillis()
        val lastSeen = dedupCache[dedupKey]
        if (lastSeen != null && (now - lastSeen) < DEDUP_WINDOW_MS) return
        dedupCache[dedupKey] = now

        val appName = try {
            packageManager.getApplicationLabel(
                packageManager.getApplicationInfo(packageName, 0)
            ).toString()
        } catch (_: Exception) {
            packageName
        }

        val subText = extras.getCharSequence("android.subText")?.toString() ?: ""
        val isGroup = subText.isNotBlank() || sbn.notification.group != null

        val data = mapOf(
            "packageName" to packageName,
            "appName" to appName,
            "title" to title,
            "text" to text,
            "bigText" to bigText,
            "subText" to subText,
            "postTime" to sbn.postTime,
            "isGroup" to isGroup
        )

        NotificationListenerModule.sendNotificationEvent(data)
    }

    private fun loadMonitoredApps() {
        val prefs = getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
        monitoredApps = prefs.getStringSet("monitored_apps", emptySet()) ?: emptySet()
    }
}
