package expo.modules.notificationlistener

import android.accessibilityservice.AccessibilityButtonController
import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Bitmap
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.Display
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import androidx.annotation.RequiresApi
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

        // Register accessibility button callback (API 26+)
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
                captureScreenshot()
            }
        }
    }

    private fun handleAccessibilityButtonClick() {
        val (packageName, extractedText, sender) = extractScreenText()
        NotificationListenerModule.setShareIntent(extractedText, sender.ifBlank { null })

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
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
                                saveBitmapToFile(bitmap)
                                bitmap.recycle()
                            }
                        } catch (_: Exception) {}
                        val screenshotPath = File(filesDir, "taskmind_share_screenshot.jpg")
                            .takeIf { it.exists() }?.absolutePath
                        fireManualTriggerAndLaunch(packageName, extractedText, sender, screenshotPath)
                    }

                    override fun onFailure(errorCode: Int) {
                        fireManualTriggerAndLaunch(packageName, extractedText, sender, null)
                    }
                }
            )
        } else {
            fireManualTriggerAndLaunch(packageName, extractedText, sender, null)
        }
    }

    private fun fireManualTriggerAndLaunch(
        packageName: String,
        extractedText: String,
        sender: String,
        screenshotPath: String?,
    ) {
        NotificationListenerModule.sendManualTriggerEvent(packageName, extractedText, sender, screenshotPath)

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

    private data class ScreenTextData(
        val packageName: String,
        val extractedText: String,
        val sender: String,
    )

    private fun extractScreenText(): ScreenTextData {
        val root = rootInActiveWindow
        val packageName = root?.packageName?.toString() ?: ""
        val texts = mutableListOf<String>()

        fun traverse(node: AccessibilityNodeInfo?) {
            node ?: return
            val text = node.text?.toString()?.trim()
            if (!text.isNullOrBlank() && text.length > 1) texts.add(text)
            for (i in 0 until node.childCount) {
                traverse(node.getChild(i))
            }
        }
        traverse(root)

        val skipPatterns = setOf("OK", "Cancel", "Back", "Done", "Send", "Menu")
        val sender = texts.firstOrNull { t ->
            t.length in 2..50 && !t.all { it.isDigit() || it == ':' } && t !in skipPatterns
        } ?: ""

        val fullText = texts.joinToString("\n").take(3000)
        return ScreenTextData(packageName, fullText, sender)
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun captureScreenshot() {
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
                            saveBitmapToFile(bitmap)
                            bitmap.recycle()
                        }
                    } catch (_: Exception) {}
                }
                override fun onFailure(errorCode: Int) {}
            }
        )
    }

    private fun saveBitmapToFile(bitmap: Bitmap) {
        try {
            val file = File(filesDir, "taskmind_share_screenshot.jpg")
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
