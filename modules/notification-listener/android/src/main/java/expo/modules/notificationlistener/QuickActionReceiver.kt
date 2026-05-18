package expo.modules.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class QuickActionReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            TaskMindForegroundService.ACTION_DONE_TOP -> {
                NotificationListenerModule.sendQuickActionDoneTop()
            }
        }
    }
}
