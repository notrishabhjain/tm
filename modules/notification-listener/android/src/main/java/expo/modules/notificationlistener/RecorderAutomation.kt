package expo.modules.notificationlistener

import android.content.Context

/**
 * The Recorder transcription flow, as a script.
 *
 * Mirrors what the user does by hand:
 *   open Recorder → tap the newest call recording → "Show text" →
 *   choose Hindi → wait for transcription → ⋮ → "Copy" → back to TaskMind,
 * which then reads the clipboard and turns the transcript into tasks.
 *
 * ## Why the labels are lists
 *
 * Every control is matched against several candidate strings — English, Hindi,
 * and the untranslated Chinese some HyperOS builds ship — because the exact
 * wording varies by firmware, locale and Recorder version. A single hardcoded
 * label would work on one phone and silently fail on the next.
 *
 * ## Why this needs tuning before it will work
 *
 * These candidates are informed guesses. The real labels and view ids can only
 * be read off the device, which is what the screen inspector is for: run it on
 * each Recorder screen, see what the controls are actually called, and correct
 * the lists below. Nothing here should be trusted until that has been done once.
 */
object RecorderAutomation {

    /**
     * Recorder package candidates, most likely first. Xiaomi has shipped the
     * recorder under several names across MIUI/HyperOS versions.
     */
    private val PACKAGE_CANDIDATES = listOf(
        "com.android.soundrecorder",
        "com.miui.soundrecorder",
        "com.xiaomi.soundrecorder",
        "com.android.recorder",
        "com.miui.recorder"
    )

    /** The recorder package actually installed, or null when none is. */
    fun installedPackage(context: Context): String? =
        PACKAGE_CANDIDATES.firstOrNull { pkg ->
            try {
                context.packageManager.getLaunchIntentForPackage(pkg) != null
            } catch (_: Throwable) {
                false
            }
        }

    // ── Control labels ───────────────────────────────────────────────────────

    private val SHOW_TEXT = listOf(
        "Show text", "View text", "Text", "Transcribe", "Transcript", "Speech to text",
        "टेक्स्ट देखें", "टेक्स्ट दिखाएं", "टेक्स्ट", "लिप्यंतरण",
        "转文本", "查看文本", "文本"
    )

    private val HINDI = listOf("Hindi", "हिन्दी", "हिंदी", "印地语")

    private val CONFIRM = listOf(
        "OK", "Done", "Confirm", "Start", "Continue",
        "ठीक", "ठीक है", "पूर्ण", "शुरू", "जारी",
        "确定", "完成", "开始"
    )

    private val MORE_OPTIONS = listOf(
        "More options", "More", "Options", "Menu",
        "अधिक विकल्प", "और", "विकल्प", "मेनू",
        "更多选项", "更多"
    )

    private val COPY = listOf(
        "Copy", "Copy text", "Copy all",
        "कॉपी", "कॉपी करें", "प्रतिलिपि",
        "复制", "复制文本"
    )

    /** Strings that indicate transcription has finished and text is on screen. */
    private val DONE_HINTS = listOf(
        "Speaker", "स्पीकर", "वक्ता", "说话人",
        "00:00"
    )

    /**
     * Builds the full flow.
     *
     * [recordingLabel] identifies which recording to open. When null the script
     * taps the first item in the list, which is the newest recording — correct
     * for "the call that just ended", and wrong for anything older, which is why
     * the caller passes a label when it has one.
     */
    fun buildScript(packageName: String, recordingLabel: String?): UiScript {
        val steps = mutableListOf<UiScript.Step>()

        steps += UiScript.Step.Launch(packageName, "Recorder")

        // Open the target recording. Matching by label when we have one avoids
        // the failure mode where the newest item is not the call we mean.
        if (recordingLabel != null) {
            steps += UiScript.Step.Tap(
                UiAutomation.Matcher(text = listOf(recordingLabel)),
                "the recording \"$recordingLabel\"",
                timeoutMs = 10_000
            )
        } else {
            steps += UiScript.Step.Tap(
                // The first row in the list; a recording row is clickable and
                // carries a duration or date as its text.
                UiAutomation.Matcher(
                    className = "RecyclerView",
                    mustBeClickable = false
                ),
                "the recordings list",
                timeoutMs = 8_000
            )
        }

        steps += UiScript.Step.Tap(
            UiAutomation.Matcher(text = SHOW_TEXT, contentDesc = SHOW_TEXT),
            "Show text"
        )

        // The language chooser appears the first time (and sometimes every
        // time). Optional because on repeat runs the choice may be remembered.
        steps += UiScript.Step.TapOptional(
            UiAutomation.Matcher(text = HINDI),
            "Hindi",
            timeoutMs = 6_000
        )
        steps += UiScript.Step.TapOptional(
            UiAutomation.Matcher(text = CONFIRM),
            "the confirm button",
            timeoutMs = 4_000
        )

        // Transcription is a cloud round-trip on a whole call: minutes, not
        // seconds. Waiting on the text appearing beats any fixed sleep.
        steps += UiScript.Step.AwaitText(
            DONE_HINTS,
            "the transcript to appear",
            timeoutMs = 300_000
        )

        steps += UiScript.Step.Tap(
            UiAutomation.Matcher(text = MORE_OPTIONS, contentDesc = MORE_OPTIONS),
            "the ⋮ menu"
        )
        steps += UiScript.Step.Tap(
            UiAutomation.Matcher(text = COPY, contentDesc = COPY),
            "Copy"
        )

        // Returning to TaskMind is not cosmetic: Android only lets the focused
        // app read the clipboard, so the import screen must be foreground before
        // it can see what was just copied.
        steps += UiScript.Step.ReturnToApp

        return UiScript("Copy transcript from Recorder", steps)
    }

    /**
     * A shorter script that only opens a recording's transcript view and reads
     * whatever text is on screen, without touching the clipboard.
     *
     * Useful when the ⋮/Copy matchers are wrong on a given firmware: reading the
     * screen is less complete than a clipboard copy (only rendered text is
     * visible) but it needs two fewer controls to match, so it works in cases
     * the full script does not.
     */
    fun buildReadOnScreenScript(packageName: String, recordingLabel: String?): UiScript {
        val steps = mutableListOf<UiScript.Step>()
        steps += UiScript.Step.Launch(packageName, "Recorder")
        if (recordingLabel != null) {
            steps += UiScript.Step.Tap(
                UiAutomation.Matcher(text = listOf(recordingLabel)),
                "the recording \"$recordingLabel\"",
                timeoutMs = 10_000
            )
        }
        steps += UiScript.Step.Tap(
            UiAutomation.Matcher(text = SHOW_TEXT, contentDesc = SHOW_TEXT),
            "Show text"
        )
        steps += UiScript.Step.TapOptional(
            UiAutomation.Matcher(text = HINDI),
            "Hindi",
            timeoutMs = 6_000
        )
        steps += UiScript.Step.AwaitText(
            DONE_HINTS,
            "the transcript to appear",
            timeoutMs = 300_000
        )
        steps += UiScript.Step.CollectVisibleText("the transcript")
        steps += UiScript.Step.ReturnToApp
        return UiScript("Read transcript from screen", steps)
    }
}
