package expo.modules.notificationlistener

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

class NotificationListenerModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "ReactContext is null" }

    override fun definition() = ModuleDefinition {
        Name("NotificationListener")

        Events("onNotification", "onQuickActionDoneTop", "onQuickActionOpen", "onManualTrigger")

        OnCreate {
            instance = this@NotificationListenerModule
        }

        OnDestroy {
            if (instance === this@NotificationListenerModule) {
                instance = null
            }
        }

        AsyncFunction("getPermissionStatus") {
            val cn = ComponentName(context, TaskMindNotificationListenerService::class.java)
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            if (enabled.contains(cn.flattenToString())) "granted" else "denied"
        }

        AsyncFunction("openPermissionSettings") {
            val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        }

        AsyncFunction("startService") {
            val intent = Intent(context, TaskMindForegroundService::class.java)
            context.startForegroundService(intent)
        }

        AsyncFunction("stopService") {
            context.stopService(Intent(context, TaskMindForegroundService::class.java))
        }

        AsyncFunction("isServiceRunning") {
            TaskMindForegroundService.isRunning
        }

        AsyncFunction("setMonitoredApps") { packageNames: List<String> ->
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            prefs.edit().putStringSet("monitored_apps", packageNames.toSet()).apply()
            val intent = Intent(TaskMindNotificationListenerService.ACTION_REFRESH_FILTER)
            context.sendBroadcast(intent)
        }

        AsyncFunction("getMonitoredApps") {
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            prefs.getStringSet("monitored_apps", emptySet())?.toList() ?: emptyList<String>()
        }

        AsyncFunction("updatePersistentNotification") { params: Map<String, Any> ->
            @Suppress("UNCHECKED_CAST")
            val taskTexts = (params["taskTexts"] as? List<*>)
                ?.mapNotNull { it as? String }
                ?: emptyList()
            val intent = Intent(context, TaskMindForegroundService::class.java).apply {
                action = TaskMindForegroundService.ACTION_UPDATE_NOTIFICATION
                putExtra("pendingCount", (params["pendingCount"] as? Number)?.toInt() ?: 0)
                putExtra("urgentCount", (params["urgentCount"] as? Number)?.toInt() ?: 0)
                putStringArrayListExtra("taskTexts", ArrayList(taskTexts))
            }
            context.startService(intent)
        }

        AsyncFunction("hidePersistentNotification") {
            val intent = Intent(context, TaskMindForegroundService::class.java).apply {
                action = TaskMindForegroundService.ACTION_HIDE_NOTIFICATION
            }
            context.startService(intent)
        }

        AsyncFunction("getPendingCapture") {
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            val json = prefs.getString("pending_accessibility_capture", null) ?: return@AsyncFunction null
            try {
                val obj = JSONObject(json)
                mapOf(
                    "extractedText" to obj.optString("extractedText", ""),
                    "sender" to obj.optString("sender", ""),
                    "packageName" to obj.optString("packageName", ""),
                    "screenshotPath" to obj.optString("screenshotPath", ""),
                    "timestamp" to obj.optLong("timestamp", 0L),
                )
            } catch (_: Exception) {
                null
            }
        }

        AsyncFunction("clearPendingCapture") {
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            prefs.edit().remove("pending_accessibility_capture").apply()
        }

        AsyncFunction("getLastShareIntent") {
            popShareIntent()
        }

        AsyncFunction("peekShareIntent") {
            peekShareIntentData()
        }

        AsyncFunction("clearShareIntent") {
            clearShareIntentData()
        }

        AsyncFunction("getLatestScreenshot") {
            val file = java.io.File(context.filesDir, "taskmind_share_screenshot.jpg")
            if (file.exists()) file.absolutePath else null
        }

        AsyncFunction("clearLatestScreenshot") {
            java.io.File(context.filesDir, "taskmind_share_screenshot.jpg").delete()
        }

        AsyncFunction("scanActiveNotifications") {
            TaskMindNotificationListenerService.triggerActiveScan()
        }

        AsyncFunction("updateWidget") {
            TaskWidgetProvider.triggerUpdate(context)
        }

        AsyncFunction("requestPinWidget") {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                val manager = AppWidgetManager.getInstance(context)
                val provider = ComponentName(context, TaskWidgetProvider::class.java)
                if (manager.isRequestPinAppWidgetSupported) {
                    manager.requestPinAppWidget(provider, null, null)
                    true
                } else {
                    false
                }
            } else {
                false
            }
        }
    }

    companion object {
        @Volatile
        var instance: NotificationListenerModule? = null

        @Volatile private var pendingShareText: String? = null
        @Volatile private var pendingShareSubject: String? = null

        fun setShareIntent(text: String, subject: String?) {
            pendingShareText = text
            pendingShareSubject = subject
        }

        fun popShareIntent(): Map<String, String?>? {
            val text = pendingShareText ?: return null
            val subject = pendingShareSubject
            pendingShareText = null
            pendingShareSubject = null
            return mapOf("text" to text, "subject" to subject)
        }

        fun peekShareIntentData(): Map<String, String?>? {
            val text = pendingShareText ?: return null
            return mapOf("text" to text, "subject" to pendingShareSubject)
        }

        fun clearShareIntentData() {
            pendingShareText = null
            pendingShareSubject = null
        }

        fun sendNotificationEvent(data: Map<String, Any>) {
            instance?.sendEvent("onNotification", data)
        }

        fun sendQuickActionDoneTop() {
            instance?.sendEvent("onQuickActionDoneTop", emptyMap<String, Any>())
        }

        fun sendQuickActionOpen() {
            instance?.sendEvent("onQuickActionOpen", emptyMap<String, Any>())
        }

        fun sendManualTriggerEvent(packageName: String, extractedText: String, sender: String, screenshotPath: String?) {
            instance?.sendEvent(
                "onManualTrigger",
                mapOf(
                    "packageName" to packageName,
                    "extractedText" to extractedText,
                    "sender" to sender,
                    "screenshotPath" to (screenshotPath ?: ""),
                )
            )
        }
    }
}
