package com.taskmind.notificationlistener

import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import org.json.JSONException
import org.json.JSONObject

/**
 * Headless JS task service that bridges a captured notification from native
 * to the JS handler registered as "TaskMindNotificationHandler" in index.ts.
 *
 * The foreground service keeps the React Native runtime alive so this task
 * reliably executes even when the UI is not visible.
 */
class TaskMindHeadlessTaskService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val json = intent?.getStringExtra(
            TaskMindNotificationListenerService.EXTRA_NOTIFICATION_JSON
        ) ?: return null

        return try {
            val jsonObj = JSONObject(json)
            val data = Arguments.createMap().apply {
                putString("packageName", jsonObj.optString("packageName"))
                putString("appName", jsonObj.optString("appName"))
                putString("title", jsonObj.optString("title"))
                putString("text", jsonObj.optString("text"))
                putString("bigText", jsonObj.optString("bigText"))
                putString("subText", jsonObj.optString("subText"))
                putDouble("postTime", jsonObj.optDouble("postTime"))
                putBoolean("isGroup", jsonObj.optBoolean("isGroup"))
            }
            HeadlessJsTaskConfig(
                /* taskKey = */ "TaskMindNotificationHandler",
                /* data = */ data,
                /* timeout = */ 5_000L,   // 5s max; extraction pipeline is fast
                /* allowedInForeground = */ true,
            )
        } catch (e: JSONException) {
            Log.e(TAG, "Failed to parse notification JSON: ${e.message}", e)
            null
        }
    }

    companion object {
        private const val TAG = "TaskMindHJSService"
    }
}
