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
import android.view.accessibility.AccessibilityWindowInfo
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.devanagari.DevanagariTextRecognizerOptions
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class TaskMindAccessibilityService : AccessibilityService() {

    private val executor = Executors.newSingleThreadExecutor()
    private val mainHandler = Handler(Looper.getMainLooper())
    private var lastShareSheetTime = 0L

    // Bundled offline ML Kit recognizers — models ship inside the APK, no network needed.
    private val latinRecognizer by lazy {
        TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
    }
    private val devanagariRecognizer by lazy {
        TextRecognition.getClient(DevanagariTextRecognizerOptions.DEFAULT_OPTIONS)
    }

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
                captureShareScreenshot()
            }
        }
    }

    private fun handleAccessibilityButtonClick() {
        deleteOldCaptureFiles()

        // Snapshot view hierarchy NOW — before the screenshot callback — for apps that
        // don't use FLAG_SECURE. Use window-type filter to avoid reading system overlays.
        val (sourcePackage, hierarchyText, hierarchySender) = extractScreenText()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val screenshotFile = File(filesDir, "taskmind_capture_${System.currentTimeMillis()}.jpg")
            takeScreenshot(
                Display.DEFAULT_DISPLAY,
                executor,
                object : TakeScreenshotCallback {
                    override fun onSuccess(screenshot: ScreenshotResult) {
                        var savedPath: String? = null
                        var ocrText = ""

                        try {
                            val hardwareBuffer = screenshot.hardwareBuffer
                            val rawBitmap = Bitmap.wrapHardwareBuffer(hardwareBuffer, null)
                            hardwareBuffer.close()

                            if (rawBitmap != null) {
                                val scaled = scaleBitmap(rawBitmap, maxWidth = 720)
                                try {
                                    FileOutputStream(screenshotFile).use { out ->
                                        scaled.compress(Bitmap.CompressFormat.JPEG, 75, out)
                                    }
                                    savedPath = screenshotFile.absolutePath
                                } finally {
                                    if (scaled !== rawBitmap) scaled.recycle()
                                }

                                // ML Kit needs a software-backed bitmap, not hardware
                                val softBitmap = if (rawBitmap.config == Bitmap.Config.HARDWARE) {
                                    rawBitmap.copy(Bitmap.Config.ARGB_8888, false)
                                } else rawBitmap

                                ocrText = runOcr(softBitmap)

                                if (softBitmap !== rawBitmap) softBitmap.recycle()
                                rawBitmap.recycle()
                            }
                        } catch (_: Exception) {}

                        // OCR text reads the actual pixels — works even for FLAG_SECURE apps
                        // (WhatsApp, banking). View hierarchy is the fallback for non-secured apps.
                        val finalText = if (ocrText.length > 20) ocrText else hierarchyText
                        val finalSender = hierarchySender.ifEmpty { extractSenderFromOcr(ocrText) }

                        storeCaptureAndLaunch(sourcePackage, finalText, finalSender, savedPath)
                    }

                    override fun onFailure(errorCode: Int) {
                        storeCaptureAndLaunch(sourcePackage, hierarchyText, hierarchySender, null)
                    }
                }
            )
        } else {
            storeCaptureAndLaunch(sourcePackage, hierarchyText, hierarchySender, null)
        }
    }

    // Run Latin + Devanagari OCR in parallel, merge results by vertical position.
    // Blocks the calling thread — only call from executor.
    private fun runOcr(bitmap: Bitmap): String {
        return try {
            val image = InputImage.fromBitmap(bitmap, 0)
            val blocks = CopyOnWriteArrayList<Pair<Int, String>>()
            val latch = CountDownLatch(2)

            latinRecognizer.process(image)
                .addOnSuccessListener { result ->
                    result.textBlocks.forEach { b ->
                        blocks.add(Pair(b.boundingBox?.centerY() ?: 0, b.text))
                    }
                    latch.countDown()
                }
                .addOnFailureListener { latch.countDown() }

            devanagariRecognizer.process(image)
                .addOnSuccessListener { result ->
                    // Only add blocks that contain actual Devanagari code points to avoid
                    // duplicating Latin text that both recognizers pick up.
                    result.textBlocks.forEach { b ->
                        if (b.text.any { it in 'ऀ'..'ॿ' }) {
                            blocks.add(Pair(b.boundingBox?.centerY() ?: 0, b.text))
                        }
                    }
                    latch.countDown()
                }
                .addOnFailureListener { latch.countDown() }

            latch.await(10L, TimeUnit.SECONDS)

            blocks.sortedBy { it.first }
                .joinToString("\n") { it.second }
                .trim()
                .take(3000)
        } catch (_: Exception) {
            ""
        }
    }

    // Infer a sender name from OCR output when view hierarchy was empty (FLAG_SECURE apps).
    private fun extractSenderFromOcr(ocrText: String): String {
        if (ocrText.isBlank()) return ""
        val skipLine = Regex(
            """^(\d{1,2}:\d{2}(\s*(am|pm))?|today|yesterday|just now|online|typing\.*)$""",
            RegexOption.IGNORE_CASE
        )
        return ocrText.lines()
            .map { it.trim() }
            .firstOrNull { line ->
                line.length in 2..60 &&
                !line.all { it.isDigit() || it == ':' } &&
                !skipLine.matches(line)
            } ?: ""
    }

    private fun deleteOldCaptureFiles() {
        try {
            filesDir.listFiles { f -> f.name.startsWith("taskmind_capture_") }
                ?.forEach { it.delete() }
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

    private data class ScreenTextData(val packageName: String, val extractedText: String, val sender: String)

    // Extract text from the view hierarchy. Returns empty for FLAG_SECURE apps (WhatsApp,
    // banking apps) — ML Kit OCR on the screenshot is the primary source in that case.
    private fun extractScreenText(): ScreenTextData {
        val appRoot = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            windows
                ?.filter { it.type == AccessibilityWindowInfo.TYPE_APPLICATION }
                ?.maxByOrNull { it.layer }
                ?.root
        } else null
        val root = appRoot ?: rootInActiveWindow

        val packageName = root?.packageName?.toString() ?: ""
        val texts = mutableListOf<String>()

        fun traverse(node: AccessibilityNodeInfo?) {
            node ?: return
            val text = node.text?.toString()?.trim()
            if (!text.isNullOrBlank() && text.length > 1) texts.add(text)
            for (i in 0 until node.childCount) traverse(node.getChild(i))
        }
        traverse(root)

        val skipWords = setOf(
            "OK", "Cancel", "Back", "Done", "Send", "Menu", "More",
            "Chats", "Status", "Calls", "Search", "Camera", "Reply", "Archive"
        )
        val sender = texts.firstOrNull { t ->
            t.length in 2..60 && !t.all { it.isDigit() || it == ':' } && t !in skipWords
        } ?: ""

        return ScreenTextData(packageName, texts.joinToString("\n").take(3000), sender)
    }

    private fun captureShareScreenshot() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return
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
                            val scaled = scaleBitmap(bitmap, maxWidth = 720)
                            FileOutputStream(file).use { out ->
                                scaled.compress(Bitmap.CompressFormat.JPEG, 75, out)
                            }
                            if (scaled !== bitmap) scaled.recycle()
                            bitmap.recycle()
                        }
                    } catch (_: Exception) {}
                }
                override fun onFailure(errorCode: Int) {}
            }
        )
    }

    private fun scaleBitmap(bitmap: Bitmap, maxWidth: Int): Bitmap {
        if (bitmap.width <= maxWidth) return bitmap
        val ratio = maxWidth.toFloat() / bitmap.width
        return Bitmap.createScaledBitmap(bitmap, maxWidth, (bitmap.height * ratio).toInt(), true)
    }

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        try {
            latinRecognizer.close()
            devanagariRecognizer.close()
        } catch (_: Exception) {}
        return super.onUnbind(intent)
    }

    override fun onInterrupt() {}
}
