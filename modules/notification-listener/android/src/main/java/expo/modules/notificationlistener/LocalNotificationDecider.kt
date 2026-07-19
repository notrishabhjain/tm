package expo.modules.notificationlistener

import android.content.Context
import android.os.Build
import android.view.textclassifier.TextClassificationManager
import android.view.textclassifier.TextClassifier

/**
 * Fully offline notification classifier. Used as the ultimate fallback in the
 * decide() chain when all three network engines (Groq, OpenRouter, Gemini) are
 * unreachable — e.g. no internet, MIUI network restriction, or data saver.
 *
 * Strategy:
 *   1. Android TextClassifier (on HyperOS, backed by Xiaomi's on-device AI) for
 *      entity and action detection.
 *   2. Hand-crafted regex patterns for English and Hindi/Hinglish task signals
 *      that the system classifier may miss.
 *   3. Hard exclusion list for automated senders and informational content.
 *
 * Precision matters more than recall: a false positive wastes one task slot;
 * a missed task is a dropped commitment. The classifier errs on the side of
 * creating a task with an "offline — verify this" note.
 */
object LocalNotificationDecider {

    data class Decision(
        val isTask: Boolean,
        val title: String?,
        val priority: String,
        val reasoning: String,
        val notes: String?
    )

    // ── English action verbs that indicate the USER must do something ──────────
    private val EN_TASK_VERBS = setOf(
        "send", "share", "submit", "upload", "download", "call", "meet", "attend",
        "join", "review", "check", "confirm", "complete", "prepare", "schedule",
        "book", "pay", "transfer", "reply", "respond", "fix", "resolve", "update",
        "provide", "deliver", "create", "make", "build", "write", "draft", "edit",
        "approve", "sign", "fill", "return", "bring", "collect", "arrange",
        "coordinate", "notify", "inform", "connect", "follow up", "reach out",
        "finalize", "close", "push", "deploy", "raise", "escalate", "register"
    )

    // ── Hindi/Hinglish action verbs (transliterated) ──────────────────────────
    private val HI_TASK_VERBS = listOf(
        "bhejo", "bhejdo", "bhej do", "bhej dena", "bhejna",
        "karo", "kar do", "karna", "kar dena",
        "dena", "de dena", "de do", "dijiye", "dijiyega",
        "batao", "bata do", "bata dena",
        "milo", "milna", "mil jao",
        "aao", "aana", "aa jao", "chale aao",
        "likhna", "likh do", "likh dena",
        "dekho", "dekhna", "dekh lo",
        "banao", "banana", "bana do",
        "lena", "le lena", "le lo",
        "jao", "chale jao",
        "upload karo", "send karo", "share karo", "check karo", "call karo",
        "submit karo", "bharna", "bhar do"
    )

    // ── Deadline / urgency signals ─────────────────────────────────────────────
    private val DEADLINE_PATTERNS = listOf(
        Regex("""by\s+(today|tonight|tomorrow|end of day|eod|monday|tuesday|wednesday|thursday|friday|\d)""", RegexOption.IGNORE_CASE),
        Regex("""(today|tonight|aaj|kal|parso)\b""", RegexOption.IGNORE_CASE),
        Regex("""(till|until|before)\s+\w""", RegexOption.IGNORE_CASE),
        Regex("""(urgent|urgently|asap|immediately|abhi|turant|jaldi|right now|right away)\b""", RegexOption.IGNORE_CASE),
        Regex("""within\s+\d+\s*(hour|minute|day|hr|min|ghante|minute)\b""", RegexOption.IGNORE_CASE),
        Regex("""\d+\s*(pm|am|baje)\b""", RegexOption.IGNORE_CASE),
        Regex("""deadline\b""", RegexOption.IGNORE_CASE),
        Regex("""(by|before)\s+\d+\s*(pm|am)\b""", RegexOption.IGNORE_CASE),
        Regex("""(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b""", RegexOption.IGNORE_CASE),
    )

    // ── Auto-sender heuristic (carrier format: XX-XXXXXX) ─────────────────────
    private val AUTO_SENDER = Regex("""^[A-Z]{2,3}-[A-Z0-9]{3,8}$""")

    // ── Content patterns that are never tasks regardless of wording ───────────
    private val INFO_SUBSTRINGS = listOf(
        "otp", "one time password", "verification code", "your code is", "use code",
        "debited", "credited", "withdrawn", "deposited", "available balance",
        "avl bal", "a/c", "txn ref", "upi txn", "transaction id",
        "order placed", "order confirmed", "order shipped", "out for delivery",
        "has been delivered", "delivery attempt", "package",
        "new message", "messages waiting", "missed call", "voicemail",
        "liked your", "commented on", "started following", "reacted to",
        "promotional", "offer expires", "cashback", "discount", "sale ends",
        "your subscription", "auto-renewed", "bill generated", "invoice attached"
    )

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Classify a notification offline. Returns a Decision that mirrors the
     * shape of [PipelineDecision] in pipeline.ts so JS can use it directly.
     */
    fun decide(
        context: Context,
        senderName: String,
        text: String,
        isGroup: Boolean
    ): Decision {
        val trimmedSender = senderName.trim()
        val lower = text.lowercase()

        // Hard exclusions
        if (AUTO_SENDER.matches(trimmedSender)) {
            return Decision(false, null, "LOW", "Auto-sender — not a person", null)
        }
        if (INFO_SUBSTRINGS.any { lower.contains(it) }) {
            return Decision(false, null, "LOW", "Informational/transactional content", null)
        }

        // Android TextClassifier: entity detection
        val tcSignals = runTextClassifier(context, text)

        // Verb matching
        val words = lower.split(Regex("\\s+"))
        val hasEnVerb = EN_TASK_VERBS.any { verb ->
            words.any { w -> w.trimEnd('!', '?', '.', ',') == verb } ||
            lower.contains(" $verb ") || lower.startsWith("$verb ")
        }
        val hasHiVerb = HI_TASK_VERBS.any { lower.contains(it) }

        // Deadline / urgency
        val deadlineHit = DEADLINE_PATTERNS.firstOrNull { it.containsMatchIn(lower) }

        val isTask = hasEnVerb || hasHiVerb || deadlineHit != null || tcSignals.hasActionEntity

        if (!isTask) {
            return Decision(false, null, "LOW",
                "No task verb, deadline, or action entity detected offline", null)
        }

        val priority = when {
            lower.contains("urgent") || lower.contains("asap") || lower.contains("abhi") ||
            lower.contains("immediately") || lower.contains("turant") ||
            lower.contains("right now") || lower.contains("right away") -> "URGENT"
            deadlineHit != null && (lower.contains("kal") || lower.contains("today") ||
                lower.contains("tonight") || lower.contains("tomorrow") ||
                lower.contains("aaj") || lower.contains("eod")) -> "HIGH"
            deadlineHit != null -> "HIGH"
            else -> "MEDIUM"
        }

        val reasonParts = buildList {
            if (hasEnVerb) add("action verb")
            if (hasHiVerb) add("Hindi action verb")
            if (deadlineHit != null) add("deadline/urgency")
            if (tcSignals.hasActionEntity) add("system classifier action")
        }

        val title = buildTitle(trimmedSender, text)
        val groupNote = if (isGroup) "Group chat — verify if this is meant for you. " else ""
        val offlineNote = "${groupNote}Analysed offline (network unavailable) — please verify."

        return Decision(
            isTask = true,
            title = title,
            priority = priority,
            reasoning = "Offline analysis: ${reasonParts.joinToString(", ")}",
            notes = offlineNote
        )
    }

    // ── Android TextClassifier wrapper ─────────────────────────────────────────

    private data class TcSignals(val hasActionEntity: Boolean)

    private fun runTextClassifier(context: Context, text: String): TcSignals {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return TcSignals(false)
        return try {
            val tcm = context.getSystemService(TextClassificationManager::class.java)
                ?: return TcSignals(false)
            val tc = tcm.textClassifier ?: return TcSignals(false)
            // Classify the first 200 chars (TextClassifier has length limits)
            val snippet = text.take(200)
            val classification = tc.classifyText(
                android.view.textclassifier.TextClassification.Request.Builder(
                    snippet, 0, snippet.length
                ).build()
            )
            // TextClassifier returns action entities like TYPE_ADDRESS, TYPE_DATE_TIME,
            // TYPE_PHONE — presence of a date/time entity suggests a scheduled event/task.
            val hasAction = (0 until classification.entityCount).any { i ->
                val type = classification.getEntity(i)
                type == TextClassifier.TYPE_DATE_TIME ||
                type == TextClassifier.TYPE_ADDRESS ||
                type == TextClassifier.TYPE_PHONE
            }
            TcSignals(hasAction)
        } catch (_: Exception) {
            TcSignals(false)
        }
    }

    // ── Title construction ─────────────────────────────────────────────────────

    private fun buildTitle(sender: String, text: String): String {
        val words = text.trim().split(Regex("\\s+"))
        val snippet = words.take(9).joinToString(" ")
        val truncated = if (words.size > 9) "$snippet…" else snippet
        return "[$sender] $truncated".take(60)
    }
}
