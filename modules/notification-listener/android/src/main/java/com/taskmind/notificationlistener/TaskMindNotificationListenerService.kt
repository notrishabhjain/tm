package com.taskmind.notificationlistener

import android.app.Notification
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import android.util.Log
import org.json.JSONObject
import java.util.LinkedHashMap

/**
 * Android NotificationListenerService that intercepts all status bar notifications.
 *
 * Responsibilities:
 *  1. Filter notifications against the monitored-apps allowlist (native, for performance).
 *  2. Deduplicate: ignore duplicate (packageName, title, text) within a 5-second window.
 *  3. Start the TaskMindForegroundService if it isn't running (process keep-alive).
 *  4. Forward qualifying notifications to JS via a Headless JS task.
 */
class TaskMindNotificationListenerService : NotificationListenerService() {

    // LRU-style map: key="pkg|title|text" → timestamp of last seen
    // Max size 200 to prevent unbounded growth
    private val dedupeCache = object : LinkedHashMap<String, Long>(64, 0.75f, true) {
        override fun removeEldestEntry(eldest: Map.Entry<String, Long>): Boolean = size > 200
    }

    override fun onListenerConnected() {
        super.onListenerConnected()
        Log.d(TAG, "NotificationListenerService connected")
        ensureForegroundServiceRunning()
    }

    override fun onListenerDisconnected() {
        super.onListenerDisconnected()
        Log.w(TAG, "NotificationListenerService disconnected")
    }

    override fun onNotificationPosted(sbn: StatusBarNotification?) {
        sbn ?: return
        try {
            processNotification(sbn)
        } catch (e: Exception) {
            Log.e(TAG, "Error processing notification: ${e.message}", e)
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Private helpers
    // ──────────────────────────────────────────────────────────────────────

    private fun processNotification(sbn: StatusBarNotification) {
        val packageName = sbn.packageName ?: return

        // 1. Filter against monitored-apps allowlist
        if (!isMonitored(packageName)) return

        // 2. Extract notification fields
        val extras: Bundle = sbn.notification?.extras ?: return
        val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString() ?: ""
        val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString() ?: ""
        val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString() ?: ""
        val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString() ?: ""
        val postTime = sbn.postTime

        // Skip if there's no meaningful content
        if (title.isBlank() && text.isBlank() && bigText.isBlank()) return

        // 3. Deduplicate within 5-second window
        val dedupeKey = "$packageName|$title|$text"
        val now = System.currentTimeMillis()
        val lastSeen = dedupeCache[dedupeKey]
        if (lastSeen != null && (now - lastSeen) < DEDUPE_WINDOW_MS) {
            Log.d(TAG, "Deduplicated: $dedupeKey")
            return
        }
        dedupeCache[dedupeKey] = now

        // 4. Resolve app name
        val appName = resolveAppName(packageName)

        // 5. Heuristic group detection
        val isGroup = subText.isNotBlank() || sbn.notification?.group != null

        Log.d(TAG, "Forwarding notification to JS: pkg=$packageName title=$title")

        // 6. Build JSON payload and dispatch Headless JS task
        val payload = JSONObject().apply {
            put("packageName", packageName)
            put("appName", appName)
            put("title", title)
            put("text", text)
            put("bigText", bigText)
            put("subText", subText)
            put("postTime", postTime)
            put("isGroup", isGroup)
        }

        dispatchHeadlessTask(payload.toString())
    }

    private fun isMonitored(packageName: String): Boolean {
        val prefs = getSharedPreferences(NotificationListenerModule.PREFS_NAME, Context.MODE_PRIVATE)
        val allowlist = prefs.getStringSet(
            NotificationListenerModule.KEY_MONITORED_APPS,
            NotificationListenerModule.DEFAULT_MONITORED_APPS
        ) ?: return false
        return allowlist.contains(packageName)
    }

    private fun resolveAppName(packageName: String): String {
        return try {
            val pm = applicationContext.packageManager
            val appInfo = pm.getApplicationInfo(packageName, 0)
            pm.getApplicationLabel(appInfo).toString()
        } catch (e: Exception) {
            packageName
        }
    }

    private fun ensureForegroundServiceRunning() {
        if (!TaskMindForegroundService.isRunning) {
            val intent = Intent(applicationContext, TaskMindForegroundService::class.java)
            applicationContext.startForegroundService(intent)
        }
    }

    private fun dispatchHeadlessTask(notificationJson: String) {
        val intent = Intent(applicationContext, TaskMindHeadlessTaskService::class.java).apply {
            putExtra(EXTRA_NOTIFICATION_JSON, notificationJson)
        }
        applicationContext.startService(intent)
    }

    companion object {
        private const val TAG = "TaskMindNLS"
        private const val DEDUPE_WINDOW_MS = 5_000L
        const val EXTRA_NOTIFICATION_JSON = "notificationJson"
    }
}
