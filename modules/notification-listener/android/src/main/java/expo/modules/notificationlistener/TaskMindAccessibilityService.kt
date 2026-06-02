package expo.modules.notificationlistener

import android.accessibilityservice.AccessibilityService
import android.os.Handler
import android.os.Looper
import android.view.accessibility.AccessibilityEvent

/**
 * Detects the current foreground app (via window-state-change events) and hands
 * it to [FocusLockManager], which decides whether to nudge/block. A lightweight
 * ticker re-checks the active overlay so the soft→hard escalation fires even when
 * the user stops generating new accessibility events (e.g. sitting on a video).
 *
 * This is the same service declared in AndroidManifest.xml; it previously had no
 * implementation class, which is why the manifest entry was dangling.
 */
class TaskMindAccessibilityService : AccessibilityService() {

    companion object {
        @Volatile
        private var instance: TaskMindAccessibilityService? = null

        /** Performs the global Home action (used by the hard-block overlay). */
        fun goHome() {
            instance?.performGlobalAction(AccessibilityService.GLOBAL_ACTION_HOME)
        }
    }

    private val handler = Handler(Looper.getMainLooper())
    private val ticker = object : Runnable {
        override fun run() {
            try {
                FocusLockManager.tick(applicationContext)
            } catch (_: Exception) {
            }
            handler.postDelayed(this, 15_000L)
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        handler.postDelayed(ticker, 15_000L)
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) return
        if (event.eventType != AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED) return
        val pkg = event.packageName?.toString() ?: return
        // Ignore transient system UI windows that aren't real foreground apps.
        if (pkg == "android" || pkg.startsWith("com.android.systemui")) return
        try {
            FocusLockManager.onForegroundApp(applicationContext, pkg)
        } catch (_: Exception) {
        }
    }

    override fun onInterrupt() {}

    override fun onUnbind(intent: android.content.Intent?): Boolean {
        handler.removeCallbacks(ticker)
        FocusLockManager.dismissOverlay()
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    override fun onDestroy() {
        super.onDestroy()
        handler.removeCallbacks(ticker)
        if (instance === this) instance = null
    }
}
