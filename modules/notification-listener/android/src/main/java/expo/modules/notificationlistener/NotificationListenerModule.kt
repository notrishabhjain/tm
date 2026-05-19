package expo.modules.notificationlistener

import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "ReactContext is null" }

    override fun definition() = ModuleDefinition {
        Name("NotificationListener")

        Events("onNotification", "onQuickActionDoneTop", "onQuickActionOpen")

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
            val intent = Intent(context, TaskMindForegroundService::class.java).apply {
                action = TaskMindForegroundService.ACTION_UPDATE_NOTIFICATION
                putExtra("pendingCount", (params["pendingCount"] as? Number)?.toInt() ?: 0)
                putExtra("urgentCount", (params["urgentCount"] as? Number)?.toInt() ?: 0)
                putExtra("topTaskText", params["topTaskText"] as? String ?: "")
                putExtra("secondTaskText", params["secondTaskText"] as? String)
            }
            context.startService(intent)
        }

        AsyncFunction("hidePersistentNotification") {
            val intent = Intent(context, TaskMindForegroundService::class.java).apply {
                action = TaskMindForegroundService.ACTION_HIDE_NOTIFICATION
            }
            context.startService(intent)
        }
    }

    companion object {
        @Volatile
        var instance: NotificationListenerModule? = null

        fun sendNotificationEvent(data: Map<String, Any>) {
            instance?.sendEvent("onNotification", data)
        }

        fun sendQuickActionDoneTop() {
            instance?.sendEvent("onQuickActionDoneTop", emptyMap<String, Any>())
        }

        fun sendQuickActionOpen() {
            instance?.sendEvent("onQuickActionOpen", emptyMap<String, Any>())
        }
    }
}
