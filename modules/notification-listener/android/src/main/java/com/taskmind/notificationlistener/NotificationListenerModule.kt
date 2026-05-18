package com.taskmind.notificationlistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import android.text.TextUtils
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Expo Module that bridges the TaskMind notification listener native code to JS.
 *
 * Exposed JS API:
 *  - getPermissionStatus() → "granted" | "denied" | "unknown"
 *  - openPermissionSettings() → void
 *  - startService() → void
 *  - stopService() → void
 *  - isServiceRunning() → boolean
 *  - setMonitoredApps(packageNames: string[]) → void
 *  - getMonitoredApps() → string[]
 *  - updatePersistentNotification(params: object) → void
 *  - hidePersistentNotification() → void
 *
 * Events emitted:
 *  - onNotification: NotificationData
 *  - onQuickActionDoneTop: null
 *  - onQuickActionOpen: null
 */
class NotificationListenerModule : Module() {

    override fun definition() = ModuleDefinition {
        Name("NotificationListenerModule")

        // ──────────────────────────────────────────────────────────────────
        // Events
        // ──────────────────────────────────────────────────────────────────
        Events("onNotification", "onQuickActionDoneTop", "onQuickActionOpen")

        // ──────────────────────────────────────────────────────────────────
        // Permission
        // ──────────────────────────────────────────────────────────────────

        AsyncFunction("getPermissionStatus") {
            val context = appContext.reactContext ?: return@AsyncFunction "unknown"
            if (isNotificationListenerGranted(context)) "granted" else "denied"
        }

        AsyncFunction("openPermissionSettings") {
            val context = appContext.reactContext ?: return@AsyncFunction
            val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        }

        // ──────────────────────────────────────────────────────────────────
        // Service lifecycle
        // ──────────────────────────────────────────────────────────────────

        AsyncFunction("startService") {
            val context = appContext.reactContext ?: return@AsyncFunction
            val intent = Intent(context, TaskMindForegroundService::class.java)
            context.startForegroundService(intent)
        }

        AsyncFunction("stopService") {
            val context = appContext.reactContext ?: return@AsyncFunction
            val intent = Intent(context, TaskMindForegroundService::class.java)
            context.stopService(intent)
        }

        AsyncFunction("isServiceRunning") {
            val context = appContext.reactContext ?: return@AsyncFunction false
            TaskMindForegroundService.isRunning
        }

        // ──────────────────────────────────────────────────────────────────
        // Monitored apps allowlist
        // ──────────────────────────────────────────────────────────────────

        AsyncFunction("setMonitoredApps") { packageNames: List<String> ->
            val context = appContext.reactContext ?: return@AsyncFunction
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.edit()
                .putStringSet(KEY_MONITORED_APPS, packageNames.toSet())
                .apply()
        }

        AsyncFunction("getMonitoredApps") {
            val context = appContext.reactContext ?: return@AsyncFunction emptyList<String>()
            val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            prefs.getStringSet(KEY_MONITORED_APPS, DEFAULT_MONITORED_APPS)?.toList()
                ?: emptyList()
        }

        // ──────────────────────────────────────────────────────────────────
        // Persistent notification
        // ──────────────────────────────────────────────────────────────────

        AsyncFunction("updatePersistentNotification") { params: Map<String, Any?> ->
            val context = appContext.reactContext ?: return@AsyncFunction
            val pendingCount = (params["pendingCount"] as? Number)?.toInt() ?: 0
            val urgentCount = (params["urgentCount"] as? Number)?.toInt() ?: 0
            val topTaskText = params["topTaskText"] as? String ?: ""
            val secondTaskText = params["secondTaskText"] as? String

            TaskMindForegroundService.updateNotification(
                context = context,
                pendingCount = pendingCount,
                urgentCount = urgentCount,
                topTaskText = topTaskText,
                secondTaskText = secondTaskText,
            )
        }

        AsyncFunction("hidePersistentNotification") {
            val context = appContext.reactContext ?: return@AsyncFunction
            TaskMindForegroundService.hideNotification(context)
        }
    }

    // ──────────────────────────────────────────────────────────────────────
    // Helpers
    // ──────────────────────────────────────────────────────────────────────

    private fun isNotificationListenerGranted(context: Context): Boolean {
        val flat = Settings.Secure.getString(
            context.contentResolver,
            "enabled_notification_listeners"
        ) ?: return false
        val cn = ComponentName(context, TaskMindNotificationListenerService::class.java)
        return flat.contains(cn.flattenToString())
    }

    companion object {
        const val PREFS_NAME = "TaskMindNativePrefs"
        const val KEY_MONITORED_APPS = "monitored_apps"
        val DEFAULT_MONITORED_APPS: Set<String> = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "com.google.android.gm",
            "com.Slack",
            "com.microsoft.teams",
            "org.telegram.messenger",
        )
    }
}
