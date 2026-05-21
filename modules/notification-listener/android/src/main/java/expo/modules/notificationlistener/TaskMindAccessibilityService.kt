package expo.modules.notificationlistener

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.graphics.Bitmap
import android.graphics.PixelFormat
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent
import androidx.annotation.RequiresApi
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.Executors

class TaskMindAccessibilityService : AccessibilityService() {

    private val executor = Executors.newSingleThreadExecutor()
    private var lastShareSheetTime = 0L

    companion object {
        // Packages that trigger a screenshot capture when their share UI appears
        private val SHARE_SOURCE_PACKAGES = setOf(
            "com.whatsapp",
            "com.whatsapp.w4b",
            "org.telegram.messenger",
            "org.thoughtcrime.securesms",
            "com.Slack",
            "com.microsoft.teams",
        )
        // Android system share sheet class names
        private const val SHARE_SHEET_CLASS = "com.android.internal.app.ChooserActivity"
        private const val SHARE_SHEET_CLASS2 = "com.android.intentresolver.ChooserActivity"
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        serviceInfo = serviceInfo.also { info ->
            info.eventTypes = AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            info.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            info.flags = AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            info.notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        event ?: return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return

        val pkg = event.packageName?.toString() ?: return
        val cls = event.className?.toString() ?: ""

        // When Android's share sheet opens, the active window before it was a source app.
        // Capture the screen to preserve context for the task being created.
        val isShareSheet = cls.contains("ChooserActivity") || cls.contains("ShareSheet") ||
                cls.contains("ResolverActivity")

        if (isShareSheet) {
            val now = System.currentTimeMillis()
            // Debounce — only capture once per 2 seconds
            if (now - lastShareSheetTime < 2000) return
            lastShareSheetTime = now
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                captureScreenshot()
            }
        }
    }

    @RequiresApi(Build.VERSION_CODES.R)
    private fun captureScreenshot() {
        takeScreenshot(
            android.view.Display.DEFAULT_DISPLAY,
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
                // Scale down to max 720px wide to save storage
                val maxW = 720
                val scaled = if (bitmap.width > maxW) {
                    val ratio = maxW.toFloat() / bitmap.width
                    Bitmap.createScaledBitmap(
                        bitmap,
                        maxW,
                        (bitmap.height * ratio).toInt(),
                        true
                    )
                } else bitmap
                scaled.compress(Bitmap.CompressFormat.JPEG, 75, out)
                if (scaled !== bitmap) scaled.recycle()
            }
        } catch (_: Exception) {}
    }

    override fun onInterrupt() {}
}
