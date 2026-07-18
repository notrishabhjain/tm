package expo.modules.notificationlistener

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.Settings
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class NotificationListenerModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "ReactContext is null" }

    override fun definition() = ModuleDefinition {
        Name("NotificationListener")

        Events(
            "onNotification",
            "onCallTranscriptionTestLog"
        )

        OnCreate {
            instance = this@NotificationListenerModule
            // JS context just came alive — replay any notifications that were
            // queued while it was dead (OEM blocked the headless start).
            TaskMindNotificationListenerService.triggerDrain()
        }

        OnDestroy {
            if (instance === this@NotificationListenerModule) {
                instance = null
            }
        }

        // ── Notification listener ────────────────────────────────────────────

        AsyncFunction("getPermissionStatus") {
            val cn = ComponentName(context, TaskMindNotificationListenerService::class.java)
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            if (enabled.contains(cn.flattenToString())) "granted" else "denied"
        }

        // Permission string vs. actual binding — they diverge after a crash.
        AsyncFunction("getListenerHealth") {
            val cn = ComponentName(context, TaskMindNotificationListenerService::class.java)
            val enabled = Settings.Secure.getString(
                context.contentResolver,
                "enabled_notification_listeners"
            ) ?: ""
            mapOf(
                "granted" to enabled.contains(cn.flattenToString()),
                "connected" to TaskMindNotificationListenerService.isConnected()
            )
        }

        // Stage counters since install — the gap between stages says exactly
        // where notifications are being lost.
        AsyncFunction("getListenerStats") {
            val p = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            TaskMindNotificationListenerService.STAT_KEYS.associateWith {
                p.getLong(it, 0L).toDouble()
            }
        }

        // Asks the system to re-bind a granted-but-dead listener (post-crash).
        AsyncFunction("rebindListener") {
            try {
                android.service.notification.NotificationListenerService.requestRebind(
                    ComponentName(context, TaskMindNotificationListenerService::class.java)
                )
            } catch (_: Exception) { }
        }

        AsyncFunction("getLastCrash") {
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .getString("last_crash", null)
        }

        AsyncFunction("clearLastCrash") {
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit().remove("last_crash").apply()
        }

        AsyncFunction("openPermissionSettings") {
            val intent = Intent("android.settings.ACTION_NOTIFICATION_LISTENER_SETTINGS").apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        }

        AsyncFunction("startService") {
            try {
                context.startForegroundService(Intent(context, TaskMindForegroundService::class.java))
            } catch (_: Throwable) { }
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

        AsyncFunction("scanActiveNotifications") {
            TaskMindNotificationListenerService.triggerActiveScan()
        }

        // Replays the missed-notification queue into JS (see triggerDrain).
        AsyncFunction("drainPendingNotifications") {
            TaskMindNotificationListenerService.triggerDrain()
        }

        // ── Confirmation notifications (the app's only user-facing output) ───

        AsyncFunction("postConfirmation") { title: String, text: String ->
            postConfirmationNotification(context, title, text)
        }

        // ── Call transcription ───────────────────────────────────────────────

        AsyncFunction("getCallTranscriptionStatus") {
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            mapOf(
                "enabled" to prefs.getBoolean("call_transcription_enabled", false),
                "hasPhoneStatePermission" to hasPermission(android.Manifest.permission.READ_PHONE_STATE),
                "hasCallLogPermission" to hasPermission(android.Manifest.permission.READ_CALL_LOG),
                "hasAllFilesAccess" to hasAllFilesAccess(),
                "apiKeySet" to true, // built-in default key always available
                "sarvamKeySet" to AsrEngine.sarvamKey(context).isNotBlank(),
                "geminiKeySet" to GeminiCallAnalyzer.apiKey(context).isNotBlank(),
            )
        }

        // Gemini key for the one-call audio→tasks engine. Blank restores the
        // built-in default; the legacy NVIDIA chain remains the fallback.
        AsyncFunction("setGeminiApiKey") { key: String ->
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit().putString("gemini_api_key", key.trim()).apply()
        }

        // Sarvam AI key — enables the Hindi/Hinglish-specialist transcription
        // engine. Empty/blank clears it (pipeline falls back to Whisper).
        AsyncFunction("setSarvamApiKey") { key: String ->
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit().putString("sarvam_api_key", key.trim()).apply()
        }

        AsyncFunction("setNvidiaApiKey") { key: String ->
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit().putString("nvidia_api_key", key.trim()).apply()
        }

        AsyncFunction("getNvidiaApiKey") {
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .getString("nvidia_api_key", null).orEmpty()
                .ifBlank { DefaultKeys.NVIDIA_ASR }
        }

        // Mirrors the MMKV Cloud-AI settings into SharedPreferences so the
        // native call pipeline can run LLM extraction while JS is dead.
        AsyncFunction("setAiCredentials") { key: String, model: String ->
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit()
                .putString("ai_api_key", key.trim())
                .putString("ai_model", model.trim())
                .apply()
        }

        AsyncFunction("setCallTranscriptionEnabled") { enabled: Boolean ->
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("call_transcription_enabled", enabled).apply()
            if (enabled) {
                try {
                    context.startForegroundService(Intent(context, TaskMindForegroundService::class.java))
                } catch (_: Exception) { }
            } else {
                CallStateMonitor.stop()
            }
        }

        AsyncFunction("setCallRecordingsDir") { dir: String? ->
            CallRecordingFinder.setCustomDir(context, dir?.takeIf { it.isNotBlank() })
        }

        AsyncFunction("requestCallTranscriptionPermissions") { promise: Promise ->
            Permissions.askForPermissionsWithPermissionsManager(
                appContext.permissions,
                promise,
                android.Manifest.permission.READ_PHONE_STATE,
                android.Manifest.permission.READ_CALL_LOG,
                android.Manifest.permission.READ_CONTACTS
            )
        }

        AsyncFunction("openAllFilesAccessSettings") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    val intent = Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION).apply {
                        data = Uri.parse("package:${context.packageName}")
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                } catch (_: Exception) {
                    val intent = Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK
                    }
                    context.startActivity(intent)
                }
            }
        }

        AsyncFunction("openAppSettings") {
            val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                data = Uri.parse("package:${context.packageName}")
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            context.startActivity(intent)
        }

        AsyncFunction("getCallDiagnostics") {
            CallTranscriptionDiagnostics.inspect(context)
        }

        AsyncFunction("runCallTranscriptionTest") { promise: Promise ->
            Thread {
                try {
                    val result = CallTranscriptionDiagnostics.runFullTest(context) { stage, message ->
                        instance?.sendEvent(
                            "onCallTranscriptionTestLog",
                            mapOf(
                                "stage" to stage,
                                "message" to message,
                                "ts" to System.currentTimeMillis().toDouble()
                            )
                        )
                    }
                    promise.resolve(result)
                } catch (e: Exception) {
                    promise.resolve(
                        mapOf("ok" to false, "stage" to "start", "error" to (e.message ?: "unknown"))
                    )
                }
            }.start()
        }

        AsyncFunction("simulateCallEnded") {
            try {
                context.startForegroundService(Intent(context, CallTranscriptionService::class.java))
            } catch (_: Exception) { }
        }

        // Recovery sweep: processes every recent recording that has no
        // call_records row yet. Safe to call any time — dedups via the DB.
        AsyncFunction("scanForMissedCalls") {
            try {
                context.startForegroundService(
                    Intent(context, CallTranscriptionService::class.java)
                        .putExtra(CallTranscriptionService.EXTRA_MODE, CallTranscriptionService.MODE_SWEEP)
                )
            } catch (_: Exception) { }
        }

        AsyncFunction("getOemInfo") {
            val mfr = Build.MANUFACTURER.lowercase()
            val brand = Build.BRAND.lowercase()
            val oem = when {
                mfr.contains("xiaomi") || brand.contains("xiaomi") ||
                    brand.contains("redmi") || brand.contains("poco") -> "xiaomi"
                mfr.contains("oppo") || mfr.contains("realme") || mfr.contains("oneplus") -> "oppo"
                mfr.contains("vivo") || mfr.contains("iqoo") -> "vivo"
                mfr.contains("huawei") || mfr.contains("honor") -> "huawei"
                mfr.contains("samsung") -> "samsung"
                else -> "other"
            }
            mapOf(
                "manufacturer" to Build.MANUFACTURER,
                "brand" to Build.BRAND,
                "oem" to oem,
                // OEMs whose battery managers kill receivers/services unless the
                // app is granted "Autostart" — a switch separate from the
                // battery-unrestricted setting.
                "needsAutostart" to (oem == "xiaomi" || oem == "oppo" || oem == "vivo" || oem == "huawei")
            )
        }

        // Opens the OEM's autostart/background-launch management screen.
        // Returns true when an OEM-specific screen opened, false when it fell
        // back to the generic app-details settings page.
        AsyncFunction("openAutostartSettings") {
            openAutostartSettingsInternal()
        }
    }

    private fun openAutostartSettingsInternal(): Boolean {
        val candidates = listOf(
            // Xiaomi / Redmi / POCO (MIUI & HyperOS)
            ComponentName(
                "com.miui.securitycenter",
                "com.miui.permcenter.autostart.AutoStartManagementActivity"
            ),
            // Oppo / Realme / OnePlus (ColorOS)
            ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.permission.startup.StartupAppListActivity"
            ),
            ComponentName(
                "com.coloros.safecenter",
                "com.coloros.safecenter.startupapp.StartupAppListActivity"
            ),
            // Vivo / iQOO
            ComponentName(
                "com.vivo.permissionmanager",
                "com.vivo.permissionmanager.activity.BgStartUpManagerActivity"
            ),
            ComponentName(
                "com.iqoo.secure",
                "com.iqoo.secure.ui.phoneoptimize.BgStartUpManager"
            ),
            // Huawei / Honor
            ComponentName(
                "com.huawei.systemmanager",
                "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity"
            )
        )
        for (component in candidates) {
            try {
                val intent = Intent().apply {
                    setComponent(component)
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
                if (context.packageManager.resolveActivity(intent, 0) != null) {
                    context.startActivity(intent)
                    return true
                }
            } catch (_: Exception) { }
        }
        // Fallback: generic app details (user navigates to autostart manually).
        return try {
            context.startActivity(
                Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                    data = Uri.parse("package:${context.packageName}")
                    flags = Intent.FLAG_ACTIVITY_NEW_TASK
                }
            )
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun hasPermission(permission: String): Boolean {
        return ContextCompat.checkSelfPermission(context, permission) ==
            PackageManager.PERMISSION_GRANTED
    }

    private fun hasAllFilesAccess(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            true
        }
    }

    companion object {
        @Volatile
        var instance: NotificationListenerModule? = null

        fun sendNotificationEvent(data: Map<String, Any>) {
            instance?.sendEvent("onNotification", data)
        }

        /** Posts a brief auto-dismissing confirmation notification. */
        fun postConfirmationNotification(context: Context, title: String, text: String) {
            try {
                val nm = context.getSystemService(NotificationManager::class.java)
                nm.createNotificationChannel(
                    NotificationChannel(
                        CallTranscriptionService.RESULT_CHANNEL_ID,
                        "Task confirmations",
                        NotificationManager.IMPORTANCE_DEFAULT
                    ).apply {
                        description = "Brief confirmations when tasks are added to Google Tasks."
                    }
                )
                val launchIntent =
                    context.packageManager.getLaunchIntentForPackage(context.packageName)
                val pi = launchIntent?.let {
                    it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
                    PendingIntent.getActivity(
                        context, title.hashCode(), it,
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
                    )
                }
                val notification = Notification.Builder(context, CallTranscriptionService.RESULT_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_popup_reminder)
                    .setContentTitle(title)
                    .setContentText(text)
                    .setAutoCancel(true)
                    .apply { if (pi != null) setContentIntent(pi) }
                    .build()
                nm.notify(title.hashCode(), notification)
            } catch (_: Exception) { }
        }
    }
}
