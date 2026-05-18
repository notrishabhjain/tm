package com.taskmind.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Handles quick-action button taps on the persistent notification.
 *
 * "Done Top" → fires a Headless JS task so JS can mark the top task complete.
 * "Open"     → handled directly via PendingIntent (no receiver needed).
 */
class QuickActionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            ACTION_DONE_TOP -> {
                Log.d(TAG, "Quick action: Done Top")
                dispatchQuickActionTask(context, "doneTop")
            }
            else -> Log.d(TAG, "QuickActionReceiver: unknown action=${intent.action}")
        }
    }

    private fun dispatchQuickActionTask(context: Context, action: String) {
        try {
            val serviceIntent = Intent(context, QuickActionHeadlessService::class.java).apply {
                putExtra(EXTRA_ACTION, action)
            }
            context.startService(serviceIntent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to dispatch quick action task: ${e.message}", e)
        }
    }

    companion object {
        const val ACTION_DONE_TOP = "com.taskmind.app.ACTION_DONE_TOP"
        const val EXTRA_ACTION = "quickAction"
        private const val TAG = "TaskMindQAReceiver"
    }
}

/**
 * Headless JS service for quick-action tasks (e.g. "doneTop").
 * Registered as "TaskMindQuickAction" in JS via AppRegistry.
 */
class QuickActionHeadlessService : HeadlessJsTaskService() {

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val action = intent?.getStringExtra(QuickActionReceiver.EXTRA_ACTION) ?: return null
        val data = Arguments.createMap().apply { putString("action", action) }
        return HeadlessJsTaskConfig(
            /* taskKey = */ "TaskMindQuickAction",
            /* data = */ data,
            /* timeout = */ 3_000L,
            /* allowedInForeground = */ true,
        )
    }
}
