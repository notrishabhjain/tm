package expo.modules.notificationlistener

import android.accessibilityservice.AccessibilityService
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

/**
 * Drives another app's UI on the user's behalf, MacroDroid-style.
 *
 * The HyperOS Recorder is the reason this exists: it transcribes calls with
 * Xiaomi's cloud AI but offers no share, no export and no readable transcript
 * file, so the only way to get the text out is to press the buttons a person
 * would press. This service presses them.
 *
 * Design constraints that are not negotiable:
 *
 *  - **Never acts on its own.** A run happens only because the user asked for
 *    one, either by tapping Run or by opting in to run-after-call. An
 *    accessibility service that starts poking other apps unprompted is the
 *    definition of malware behaviour, regardless of intent.
 *  - **Never guesses.** If a step cannot find its target, the run stops and
 *    reports which step failed. Tapping "something nearby" in someone's phone
 *    app could place a call, delete a recording, or worse.
 *  - **Always interruptible.** [abort] stops the run at the next step boundary,
 *    and the foreground UI exposes it.
 *  - **Reports everything.** Every step emits a log line, because when this
 *    breaks — and another app's layout will change eventually — the log is the
 *    only way to see where.
 */
class TaskMindAccessibilityService : AccessibilityService() {

    companion object {
        private const val TAG = "TaskMindA11y"

        @Volatile
        private var instance: TaskMindAccessibilityService? = null

        /** True only while the system actually has the service bound. */
        fun isRunning(): Boolean = instance != null

        @Volatile
        private var aborting = false

        /** Requests that any in-flight run stop at the next step boundary. */
        fun abort() {
            aborting = true
        }

        /** Runs [script], reporting progress through [onLog]. Blocking; call off-main. */
        fun run(script: UiScript, onLog: (String) -> Unit): UiScript.Result {
            val svc = instance
                ?: return UiScript.Result(false, "Accessibility service is not enabled", emptyList())
            aborting = false
            return svc.execute(script, onLog)
        }

        fun currentRootPackage(): String? = instance?.rootInActiveWindow?.packageName?.toString()

        /** Dumps the foreground window so matchers can be written against reality. */
        fun dumpForegroundWindow(): Map<String, Any> {
            val svc = instance ?: return mapOf("error" to "Accessibility service is not enabled")
            val root = svc.rootInActiveWindow
                ?: return mapOf("error" to "No foreground window is readable right now")
            return mapOf(
                "package" to (root.packageName?.toString() ?: ""),
                "nodes" to UiAutomation.dump(root)
            )
        }
    }

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.d(TAG, "Accessibility service connected")
    }

    override fun onDestroy() {
        super.onDestroy()
        if (instance === this) instance = null
    }

    override fun onUnbind(intent: Intent?): Boolean {
        if (instance === this) instance = null
        return super.onUnbind(intent)
    }

    // The service declares no event types it cares about — it is a driver, not
    // an observer. Notification watching is a separate, already-granted service.
    override fun onAccessibilityEvent(event: AccessibilityEvent?) { /* not used */ }

    override fun onInterrupt() {
        aborting = true
    }

    // ── Execution ────────────────────────────────────────────────────────────

    private fun execute(script: UiScript, onLog: (String) -> Unit): UiScript.Result {
        val collected = mutableListOf<String>()
        onLog("Starting: ${script.name}")

        for ((index, step) in script.steps.withIndex()) {
            if (aborting) {
                onLog("Stopped at your request")
                return UiScript.Result(false, "aborted", collected)
            }
            val label = "Step ${index + 1}/${script.steps.size}: ${step.describe()}"
            onLog(label)

            val outcome = runStep(step, collected, onLog)
            if (!outcome) {
                val why = "Could not complete — ${step.describe()}"
                onLog("✗ $why")
                // Deliberately no recovery attempt: pressing an unknown control
                // in another app is exactly what must never happen.
                return UiScript.Result(false, why, collected)
            }
        }

        onLog("✓ Finished: ${script.name}")
        return UiScript.Result(true, null, collected)
    }

    private fun runStep(
        step: UiScript.Step,
        collected: MutableList<String>,
        onLog: (String) -> Unit
    ): Boolean {
        return when (step) {
            is UiScript.Step.Launch -> launchPackage(step.packageName, onLog)

            is UiScript.Step.Wait -> {
                sleep(step.millis)
                true
            }

            is UiScript.Step.Tap -> awaitAndClick(step.matcher, step.timeoutMs, onLog)

            is UiScript.Step.TapOptional -> {
                val done = awaitAndClick(step.matcher, step.timeoutMs) { }
                if (!done) onLog("  (optional step skipped — not present)")
                true
            }

            is UiScript.Step.AwaitText -> {
                val found = awaitCondition(step.timeoutMs) { root ->
                    UiAutomation.collectText(root).any { line ->
                        step.anyOf.any { line.contains(it, ignoreCase = true) }
                    }
                }
                if (!found) onLog("  (timed out waiting for: ${step.anyOf.joinToString("|")})")
                found
            }

            is UiScript.Step.CollectVisibleText -> {
                val root = rootInActiveWindow
                val lines = UiAutomation.collectText(root)
                collected += lines
                onLog("  captured ${lines.size} line(s) from screen")
                lines.isNotEmpty()
            }

            is UiScript.Step.Back -> {
                performGlobalAction(GLOBAL_ACTION_BACK)
                sleep(400)
                true
            }

            is UiScript.Step.ReturnToApp -> {
                launchPackage(packageName, onLog)
            }
        }
    }

    /**
     * Polls for [matcher] until it appears, then clicks it.
     *
     * Polling rather than a single look because the screen after a tap is not
     * ready immediately, and transcription in particular takes as long as it
     * takes. A fixed sleep would either be too short (flaky) or too long
     * (unusable).
     */
    private fun awaitAndClick(
        matcher: UiAutomation.Matcher,
        timeoutMs: Long,
        onLog: (String) -> Unit
    ): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (aborting) return false
            val root = rootInActiveWindow
            val node = UiAutomation.find(root, matcher)
            if (node != null) {
                val clicked = UiAutomation.click(node)
                if (clicked) {
                    // Give the target app a beat to react before the next step
                    // looks at the screen.
                    sleep(POST_TAP_SETTLE_MS)
                    return true
                }
                onLog("  found the control but it refused the tap; retrying")
            }
            sleep(POLL_INTERVAL_MS)
        }
        return false
    }

    private fun awaitCondition(
        timeoutMs: Long,
        predicate: (AccessibilityNodeInfo?) -> Boolean
    ): Boolean {
        val deadline = System.currentTimeMillis() + timeoutMs
        while (System.currentTimeMillis() < deadline) {
            if (aborting) return false
            if (predicate(rootInActiveWindow)) return true
            sleep(POLL_INTERVAL_MS)
        }
        return false
    }

    private fun launchPackage(pkg: String, onLog: (String) -> Unit): Boolean {
        return try {
            val intent = packageManager.getLaunchIntentForPackage(pkg)
            if (intent == null) {
                onLog("  no launchable activity for $pkg")
                return false
            }
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            startActivity(intent)
            sleep(LAUNCH_SETTLE_MS)
            true
        } catch (t: Throwable) {
            onLog("  could not launch $pkg: ${t.message}")
            false
        }
    }

    private fun sleep(ms: Long) {
        try {
            Thread.sleep(ms)
        } catch (_: InterruptedException) {
            Thread.currentThread().interrupt()
        }
    }
}

private const val POLL_INTERVAL_MS = 350L
private const val POST_TAP_SETTLE_MS = 700L
private const val LAUNCH_SETTLE_MS = 1500L

/** Convenience for posting work back to the main thread. */
internal fun onMain(block: () -> Unit) {
    Handler(Looper.getMainLooper()).post(block)
}

/** Whether the user has enabled TaskMind's accessibility service in Settings. */
internal fun isAccessibilityEnabled(context: Context): Boolean {
    return try {
        val expected = "${context.packageName}/${TaskMindAccessibilityService::class.java.name}"
        val enabled = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: ""
        enabled.split(':').any { it.equals(expected, ignoreCase = true) }
    } catch (_: Throwable) {
        false
    }
}
