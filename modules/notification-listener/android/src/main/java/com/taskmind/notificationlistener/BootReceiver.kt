package com.taskmind.notificationlistener

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log

/**
 * BroadcastReceiver that restarts the TaskMind foreground service on device boot.
 *
 * Handles both standard BOOT_COMPLETED and Xiaomi's QUICKBOOT_POWERON.
 * Requires RECEIVE_BOOT_COMPLETED permission in AndroidManifest.xml.
 */
class BootReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            "android.intent.action.QUICKBOOT_POWERON",    // Xiaomi / HTC
            "com.htc.intent.action.QUICKBOOT_POWERON",   // older HTC
            -> {
                Log.d(TAG, "Boot completed — starting TaskMind foreground service")
                try {
                    val serviceIntent = Intent(context, TaskMindForegroundService::class.java)
                    context.startForegroundService(serviceIntent)
                } catch (e: Exception) {
                    Log.e(TAG, "Failed to start service on boot: ${e.message}", e)
                }
            }
            else -> {
                Log.d(TAG, "BootReceiver: ignoring action=${intent.action}")
            }
        }
    }

    companion object {
        private const val TAG = "TaskMindBootReceiver"
    }
}
