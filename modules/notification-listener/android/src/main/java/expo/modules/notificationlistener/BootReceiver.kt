package expo.modules.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        if (action == Intent.ACTION_BOOT_COMPLETED ||
            action == "android.intent.action.QUICKBOOT_POWERON"
        ) {
            try {
                context.startForegroundService(
                    Intent(context, TaskMindForegroundService::class.java)
                )
            } catch (_: Throwable) {
                // OEM restriction — the listener binding will start it instead.
            }
            // Arm the watchdog alarm so the FGS is revived if OEM kills it
            // before the notification listener binding fires.
            WatchdogAlarmReceiver.schedule(context)
        }
    }
}
