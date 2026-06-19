package expo.modules.notificationlistener

import android.appwidget.AppWidgetManager
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
import org.json.JSONObject

class NotificationListenerModule : Module() {

    private val context: Context
        get() = requireNotNull(appContext.reactContext) { "ReactContext is null" }

    override fun definition() = ModuleDefinition {
        Name("NotificationListener")

        Events(
            "onNotification",
            "onQuickActionDoneTop",
            "onQuickActionOpen",
            "onManualTrigger",
            "onCallTranscriptReady",
            "onCallTranscriptionTestLog"
        )

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
            try {
                context.startService(intent)
            } catch (_: IllegalStateException) {
                // App is backgrounded and the service is dead — restart it as a
                // foreground service, which is always permitted for FGS-exempt flows.
                context.startForegroundService(intent)
            }
        }

        AsyncFunction("hidePersistentNotification") {
            val intent = Intent(context, TaskMindForegroundService::class.java).apply {
                action = TaskMindForegroundService.ACTION_HIDE_NOTIFICATION
            }
            try {
                context.startService(intent)
            } catch (_: IllegalStateException) {
                // Service already dead and app backgrounded — nothing to hide.
            }
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

        AsyncFunction("peekPendingCallTranscript") {
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            val text = prefs.getString("pending_transcript_text", null) ?: return@AsyncFunction null
            mapOf(
                "text" to text,
                "callTime" to prefs.getLong("pending_transcript_time", System.currentTimeMillis()).toDouble(),
                "callerLabel" to (prefs.getString("pending_transcript_caller", null) ?: "Unknown")
            )
        }

        AsyncFunction("clearPendingCallTranscript") {
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE).edit()
                .remove("pending_transcript_text")
                .remove("pending_transcript_time")
                .remove("pending_transcript_caller")
                .apply()
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

        // ── Focus-lock (app blocking / anti-doomscroll) ─────────────────────────

        AsyncFunction("focusGetState") {
            mapOf(
                "enabled" to context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                    .getBoolean("focus_lock_enabled", false),
                "sessionEndsAt" to context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                    .getLong("focus_session_end", 0L).toDouble(),
                "bypassesLeft" to FocusLockManager.bypassesLeftToday(context),
                "maxBypasses" to FocusLockManager.MAX_BYPASSES_PER_DAY,
                "hasOverlayPermission" to FocusLockManager.hasOverlayPermission(context),
                "accessibilityEnabled" to isAccessibilityEnabled(),
                "lockActive" to FocusLockManager.isLockActive(context)
            )
        }

        AsyncFunction("focusSetEnabled") { enabled: Boolean ->
            FocusLockManager.setEnabled(context, enabled)
        }

        AsyncFunction("focusStartSession") { minutes: Int ->
            FocusLockManager.startSession(context, minutes)
        }

        AsyncFunction("focusEndSession") {
            FocusLockManager.endSession(context)
        }

        AsyncFunction("focusGetBlockApps") {
            FocusLockManager.blockedApps(context).toList()
        }

        AsyncFunction("focusSetBlockApps") { packages: List<String> ->
            FocusLockManager.setBlockApps(context, packages.toSet())
        }

        AsyncFunction("requestOverlayPermission") {
            val intent = Intent(
                Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                android.net.Uri.parse("package:${context.packageName}")
            ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
            try {
                context.startActivity(intent)
            } catch (_: Exception) {
            }
        }

        AsyncFunction("openAccessibilitySettings") {
            val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK
            }
            try {
                context.startActivity(intent)
            } catch (_: Exception) {
            }
        }

        // ── In-app call transcription (replaces Termux + MacroDroid) ───────────

        AsyncFunction("getCallTranscriptionStatus") {
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            mapOf(
                "enabled" to prefs.getBoolean("call_transcription_enabled", false),
                "hasPhoneStatePermission" to hasPermission(android.Manifest.permission.READ_PHONE_STATE),
                "hasCallLogPermission" to hasPermission(android.Manifest.permission.READ_CALL_LOG),
                "hasAllFilesAccess" to hasAllFilesAccess(),
                "apiKeySet" to prefs.getString("nvidia_api_key", null).orEmpty().isNotBlank(),
            )
        }

        AsyncFunction("setNvidiaApiKey") { key: String ->
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit().putString("nvidia_api_key", key.trim()).apply()
        }

        AsyncFunction("getNvidiaApiKey") {
            context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .getString("nvidia_api_key", null).orEmpty()
        }

        AsyncFunction("setCallTranscriptionEnabled") { enabled: Boolean ->
            val prefs = context.getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("call_transcription_enabled", enabled).apply()
            if (enabled) {
                // (Re-)start the foreground service so its onStartCommand else-branch
                // calls CallStateMonitor.start() — handles the case where the service
                // was already alive when READ_PHONE_STATE was first granted.
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
                android.Manifest.permission.READ_CALL_LOG
            )
        }

        AsyncFunction("openAllFilesAccessSettings") {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                try {
                    val intent = Intent(
                        Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
                        Uri.parse("package:${context.packageName}")
                    ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
                    context.startActivity(intent)
                } catch (_: Exception) {
                    openAppDetailsSettings()
                }
            }
        }

        // Opens this app's system "App info" page — a reliable fallback for
        // granting any permission when the runtime dialog was permanently
        // denied ("Don't ask again").
        AsyncFunction("openAppSettings") {
            openAppDetailsSettings()
        }

        // ── Call-transcription diagnostics (debug screen) ──────────────────────

        AsyncFunction("getCallDiagnostics") {
            CallTranscriptionDiagnostics.inspect(context)
        }

        // Runs the full decode + transcribe pipeline on the newest recording on
        // demand (ignores enabled flag + processed marker). Heavy — runs on its
        // own thread so it never blocks the bridge.
        AsyncFunction("runCallTranscriptionTest") { promise: Promise ->
            Thread {
                try {
                    val result = CallTranscriptionDiagnostics.runFullTest(context) { stage, message ->
                        val inst = instance
                        inst?.sendEvent(
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
                    promise.reject("test_failed", e.message ?: "Test failed", e)
                }
            }.start()
        }

        // Fires the exact path a real call-end takes: starts CallTranscriptionService.
        AsyncFunction("simulateCallEnded") {
            context.startForegroundService(
                Intent(context, CallTranscriptionService::class.java)
            )
        }
    }

    private fun openAppDetailsSettings() {
        try {
            val intent = Intent(
                Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
                Uri.parse("package:${context.packageName}")
            ).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
            context.startActivity(intent)
        } catch (_: Exception) {
        }
    }

    private fun hasPermission(permission: String): Boolean =
        ContextCompat.checkSelfPermission(context, permission) == PackageManager.PERMISSION_GRANTED

    private fun hasAllFilesAccess(): Boolean =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            Environment.isExternalStorageManager()
        } else {
            hasPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE)
        }

    private fun isAccessibilityEnabled(): Boolean {
        val cn = ComponentName(context, TaskMindAccessibilityService::class.java)
        val enabled = Settings.Secure.getString(
            context.contentResolver,
            Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        return enabled.split(':').any { it.equals(cn.flattenToString(), ignoreCase = true) }
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

        fun sendCallTranscriptReady(text: String, callTimeMs: Long, callerLabel: String) {
            instance?.sendEvent(
                "onCallTranscriptReady",
                mapOf(
                    "text" to text,
                    "callTime" to callTimeMs.toDouble(),
                    "callerLabel" to callerLabel,
                )
            )
        }
    }
}
