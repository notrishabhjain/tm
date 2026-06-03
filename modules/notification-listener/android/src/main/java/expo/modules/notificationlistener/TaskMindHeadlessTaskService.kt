package expo.modules.notificationlistener

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

/**
 * Runs the JS notification pipeline (`handleNotification`) in a background JS
 * context when the app's UI/JS is not alive. The native NotificationListener
 * service dispatches to this only when [NotificationListenerModule.instance] is
 * null (i.e. the React context is dead). The registered JS task name is
 * "TaskMindNotificationHandler" (see index.js).
 */
class TaskMindHeadlessTaskService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent): HeadlessJsTaskConfig? {
        val extras = intent.extras ?: return null
        return HeadlessJsTaskConfig(
            "TaskMindNotificationHandler",
            Arguments.fromBundle(extras),
            60_000L, // generous timeout: AI call + DB writes
            true // allowedInForeground — safe; we only start this when JS is dead
        )
    }
}
