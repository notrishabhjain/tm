package expo.modules.notificationlistener

/**
 * A declarative sequence of UI actions for [TaskMindAccessibilityService].
 *
 * Scripts are data rather than code so that the fragile part — which button to
 * press, and what it is called on this particular firmware — sits in one
 * readable place. When the Recorder app updates and a label changes, the fix is
 * a string in [RecorderAutomation], not a rewrite of the driver.
 */
data class UiScript(
    val name: String,
    val steps: List<Step>
) {
    data class Result(
        val ok: Boolean,
        /** Why the run stopped, when it did not finish. */
        val error: String?,
        /** Text captured by CollectVisibleText steps, in order. */
        val captured: List<String>
    )

    sealed class Step {
        abstract fun describe(): String

        /** Brings an app to the foreground. */
        data class Launch(val packageName: String, val label: String) : Step() {
            override fun describe() = "open $label"
        }

        /** Waits a fixed period — use sparingly; prefer AwaitText. */
        data class Wait(val millis: Long, val why: String) : Step() {
            override fun describe() = "wait ${millis / 1000}s ($why)"
        }

        /** Finds and taps a control. Fails the run if it never appears. */
        data class Tap(
            val matcher: UiAutomation.Matcher,
            val label: String,
            val timeoutMs: Long = 8_000
        ) : Step() {
            override fun describe() = "tap $label"
        }

        /**
         * Taps a control if it is there, and carries on if it is not.
         *
         * Needed for genuinely conditional UI: a language chooser that only
         * appears the first time, a consent sheet shown once. Used only where
         * absence is expected — never as a way to paper over a matcher that
         * might be wrong.
         */
        data class TapOptional(
            val matcher: UiAutomation.Matcher,
            val label: String,
            val timeoutMs: Long = 2_500
        ) : Step() {
            override fun describe() = "tap $label if present"
        }

        /** Waits until any of [anyOf] appears on screen. */
        data class AwaitText(
            val anyOf: List<String>,
            val label: String,
            val timeoutMs: Long = 180_000
        ) : Step() {
            override fun describe() = "wait for $label"
        }

        /** Captures every visible text node, for reading a transcript off-screen. */
        data class CollectVisibleText(val label: String) : Step() {
            override fun describe() = "read $label from screen"
        }

        /** Presses the system Back button. */
        data class Back(val why: String) : Step() {
            override fun describe() = "go back ($why)"
        }

        /** Returns to TaskMind, which is also what makes the clipboard readable. */
        object ReturnToApp : Step() {
            override fun describe() = "return to TaskMind"
        }
    }
}
