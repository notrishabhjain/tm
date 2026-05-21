package expo.modules.notificationlistener

import android.accessibilityservice.AccessibilityButtonController
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Context
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.annotation.RequiresApi
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

class TaskMindAccessibilityService : AccessibilityService() {

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var lastShareSheetTime = 0L

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo.also { info ->
            info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED or
                    AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            info.flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS or
                    AccessibilityServiceInfo.FLAG_REQUEST_ACCESSIBILITY_BUTTON
            info.notificationTimeout = 100
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            accessibilityButtonController.registerAccessibilityButtonCallback(
                object : AccessibilityButtonController.AccessibilityButtonCallback() {
                    override fun onClicked(controller: AccessibilityButtonController) {
                        handleAccessibilityButtonClick()
                    }
                    override fun onAvailabilityChanged(
                        controller: AccessibilityButtonController,
                        available: Boolean,
                    ) {}
                }
            )
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val cls = event.className?.toString() ?: ""
        val isShareSheet = cls.contains("ChooserActivity") || cls.contains("ShareSheet") ||
                cls.contains("ResolverActivity")
        if (isShareSheet) {
            val now = System.currentTimeMillis()
            if (now - lastShareSheetTime < 2000) return
            lastShareSheetTime = now
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                captureScreenshot(screenshotForTask = false)
            }
        }
    }

    private fun handleAccessibilityButtonClick() {
        val (sourcePackage, extractedText, sender) = extractScreenText()

        // Always delete any leftover capture file before starting a new one
        deleteOldCaptureFiles()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val screenshotFile = File(filesDir, "taskmind_capture_${System.currentTimeMillis()}.jpg")
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                executor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshot: ScreenshotResult) {
                        var savedPath: String? = null
                        try {
                            val hardwareBuffer = screenshot.hardwareBuffer
                            val bitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, null)
                            hardwareBuffer.close()
                            if (bitmap != null) {
                                saveBitmapToFile(bitmap, screenshotFile)
                                savedPath = screenshotFile.absolutePath
                                bitmap.recycle()
                            }
                        } catch (_: Exception) {}
                        storeCaptureAndLaunch(sourcePackage, extractedText, sender, savedPath)
                    }

                    override fun onFailure(errorCode: Int) {
                        storeCaptureAndLaunch(sourcePackage, extractedText, sender, null)
                    }
                }
            )
        } else {
            storeCaptureAndLaunch(sourcePackage, extractedText, sender, null)
        }
    }

    private fun deleteOldCaptureFiles() {
        try {
            filesDir.listFiles { f -> f.name.startsWith("taskmind_capture_") }
                ?.forEach { it.delete() }
            // Also clear the SharedPreferences flag so stale data is never processed
            getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit().remove("pending_accessibility_capture").apply()
        } catch (_: Exception) {}
    }

    private fun storeCaptureAndLaunch(
        packageName: String,
        extractedText: String,
        sender: String,
        screenshotPath: String?,
    ) {
        // Persist in SharedPreferences — survives RN bridge restarts and background states
        try {
            val json = JSONObject().apply {
                put("extractedText", extractedText)
                put("sender", sender)
                put("packageName", packageName)
                put("screenshotPath", screenshotPath ?: "")
                put("timestamp", System.currentTimeMillis())
            }
            getSharedPreferences("taskmind_prefs", Context.MODE_PRIVATE)
                .edit().putString("pending_accessibility_capture", json.toString()).apply()
        } catch (_: Exception) {}

        // Send event to RN (handled if app is in foreground and bridge is active)
        NotificationListenerModule.sendManualTriggerEvent(packageName, extractedText, sender, screenshotPath)

        // Bring TaskMind to foreground so AppState.active fires and we read the SharedPrefs
        mainHandler.post {
            try {
                val launchIntent = packageManager.getLaunchIntentForPackage(this.packageName)
                launchIntent?.addFlags(
                    android.content.Intent.FLAG_ACTIVITY_NEW_TASK or
                            android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
                )
                launchIntent?.let { startActivity(it) }
            } catch (_: Exception) {}
        }
    }

    private data class ScreenTextData(val packageName: String, val extractedText: String, val sender: String)

    private fun extractScreenText(): ScreenTextData {
        val root = rootInActiveWindow
        val packageName = root?.packageName?.toString() ?: ""
        val texts = mutableListOf<String>()
        fun traverse(node: AccessibilityNodeInfo?) {
            node ?: return
            val text = node.text?.toString()?.trim()
            if (!text.isNullOrBlank() && text.length > 1) texts.add(text)
            for (i in 0 until node.childCount) traverse(node.getChild(i))
        }
        traverse(root)
        val skipWords = setOf("OK", "Cancel", "Back", "Done", "Send", "Menu", "More")
        val sender = texts.firstOrNull { t ->
            t.length in 2..60 && !t.all { it.isDigit() || it == ':' } && t !in skipWords
        } ?: ""
        return ScreenTextData(packageName, texts.joinToString("\n").take(3000), sender)
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun captureScreenshot(screenshotForTask: Boolean) {
        val file = File(filesDir, "taskmind_share_screenshot.jpg")
        takeScreenshot(
            Display.DEFAULT_DISPLAY,
            executor,
            object : TakeScreenshotCallback {
                override fun onSuccess(screenshot: ScreenshotResult) {
                    try {
                        val hardwareBuffer = screenshot.hardwareBuffer
                        val bitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, null)
                        hardwareBuffer.close()
                        if (bitmap != null) {
                            saveBitmapToFile(bitmap, file)
                            bitmap.recycle()
                        }
                    } catch (_: Exception) {}
                }
                override fun onFailure(errorCode: Int) {}
            }
        )
    }

    private fun saveBitmapToFile(bitmap: Bitmap, file: File) {
        try {
            FileOutputStream(file).use { out ->
                val maxW = 720
                val scaled = if (bitmap.width > maxW) {
                    val ratio = maxW.toFloat() / bitmap.width
                    Bitmap.createScaledBitmap(bitmap, maxW, (bitmap.height * ratio).toInt(), true)
                } else bitmap
                scaled.compress(Bitmap.CompressFormat.JPEG, 75, out)
                if (scaled !== bitmap) scaled.recycle()
            }
        } catch (_: Exception) {}
    }

    override fun onInterrupt() {}
}
