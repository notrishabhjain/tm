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
        val notes: String?,
        /**
         * 0..1 strength of the signal, consumed by the confidence gate in
         * task-intake.ts. Deliberately capped below the auto-create threshold
         * unless several independent signals agree: a regex classifier that
         * claims certainty would write wrong tasks straight into the user's
         * list, which costs more trust than a task that waits in review.
         */
        val confidence: Double
    )

    // Signal weights. They sum to more than 1.0 on purpose — the score is
    // clamped, so agreement between independent signals is what produces a
    // high number, not any single one of them firing.
    private const val W_ACTION_VERB = 0.34
    private const val W_DEADLINE = 0.22
    private const val W_DIRECT_ADDRESS = 0.20
    private const val W_IMPERATIVE = 0.12
    private const val W_CLASSIFIER = 0.12
    private const val PENALTY_GROUP_INDIRECT = 0.22

    /** Ceiling for a purely heuristic verdict — see [Decision.confidence]. */
    private const val HEURISTIC_CEILING = 0.80

    // Second-person address, the strongest indicator that the request is aimed
    // at the reader rather than being narration or a broadcast.
    private val DIRECT_ADDRESS = Regex(
        """\b(you|your|u r|ur|aap|aapko|aapse|tum|tumhe|tumko|tere|tera|teri|bhai|sir|madam)\b""",
        RegexOption.IGNORE_CASE
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

        // Hard exclusions. These are certainties, so they carry confidence 0.0 —
        // the gate discards them outright rather than queueing them for review.
        if (text.isBlank()) {
            return Decision(false, null, "LOW", "Empty message", null, 0.0)
        }
        if (AUTO_SENDER.matches(trimmedSender)) {
            return Decision(false, null, "LOW", "Auto-sender — not a person", null, 0.0)
        }
        if (INFO_SUBSTRINGS.any { lower.contains(it) }) {
            return Decision(false, null, "LOW", "Informational/transactional content", null, 0.0)
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

        val hasVerb = hasEnVerb || hasHiVerb
        val isDirect = DIRECT_ADDRESS.containsMatchIn(text)
        // An imperative opener ("send me the deck") is a strong request signal
        // that verb-anywhere matching alone does not distinguish from narration
        // ("I already sent the deck").
        val firstWord = words.firstOrNull()?.trimEnd('!', '?', '.', ',') ?: ""
        val isImperativeOpen = EN_TASK_VERBS.contains(firstWord) ||
            HI_TASK_VERBS.any { lower.startsWith(it) }

        val isTask = hasVerb || deadlineHit != null || tcSignals.hasActionEntity

        if (!isTask) {
            return Decision(false, null, "LOW",
                "No task verb, deadline, or action entity detected offline", null, 0.0)
        }

        // ── Score ─────────────────────────────────────────────────────────────
        var score = 0.0
        if (hasVerb) score += W_ACTION_VERB
        if (deadlineHit != null) score += W_DEADLINE
        if (isDirect) score += W_DIRECT_ADDRESS
        if (isImperativeOpen) score += W_IMPERATIVE
        if (tcSignals.hasActionEntity) score += W_CLASSIFIER
        // In a group with no second-person address, the request may well be
        // aimed at somebody else in the room. Worth surfacing, not worth
        // asserting — so the penalty pushes it toward review, not discard.
        if (isGroup && !isDirect) score -= PENALTY_GROUP_INDIRECT

        // A bare date entity with no verb at all is the weakest thing that still
        // reaches here; keep it clearly inside the review band.
        if (!hasVerb) score = minOf(score, 0.45)

        val confidence = score.coerceIn(0.0, HEURISTIC_CEILING)

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
            if (isImperativeOpen) add("imperative phrasing")
            if (isDirect) add("addressed to you")
            if (deadlineHit != null) add("deadline/urgency")
            if (tcSignals.hasActionEntity) add("system classifier action")
            if (isGroup && !isDirect) add("group chat, no direct address")
        }

        val title = buildTitle(text)
        val groupNote = if (isGroup && !isDirect) {
            "Group chat — verify this is meant for you. "
        } else ""
        val note = "${groupNote}Classified on-device from: \"${text.trim().take(160)}\""

        return Decision(
            isTask = true,
            title = title,
            priority = priority,
            reasoning = "On-device analysis: ${reasonParts.joinToString(", ")}",
            notes = note,
            confidence = confidence
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

    /**
     * Builds the task title from the message itself.
     *
     * The previous version prefixed every title with "[Sender]" and then took
     * the first nine words, which produced titles like "[Sharma Ji] haan to
     * phir main keh raha…" — the sender is already carried separately as the
     * task's source label, and the opening words of a message are usually
     * greeting rather than request. This picks the clause that actually
     * contains the action instead.
     */
    private fun buildTitle(text: String): String {
        val cleaned = text.trim().replace(Regex("\\s+"), " ")
        // Split into clauses on sentence and clause boundaries, keeping order.
        val clauses = cleaned.split(Regex("(?<=[.!?।])\\s+|,\\s+|\\s+-\\s+"))
            .map { it.trim() }
            .filter { it.isNotEmpty() }

        val lowerOf = { s: String -> s.lowercase() }
        // Prefer the first clause carrying an action verb; fall back to the
        // longest clause, which is more informative than the first.
        val actionClause = clauses.firstOrNull { clause ->
            val l = lowerOf(clause)
            val w = l.split(Regex("\\s+")).map { it.trimEnd('!', '?', '.', ',') }
            EN_TASK_VERBS.any { v -> w.contains(v) || l.contains(" $v ") || l.startsWith("$v ") } ||
                HI_TASK_VERBS.any { v -> l.contains(v) }
        } ?: clauses.maxByOrNull { it.length } ?: cleaned

        val words = actionClause.split(Regex("\\s+"))
        val snippet = words.take(14).joinToString(" ")
        val title = if (words.size > 14) "$snippet…" else snippet
        // Capitalise so the list reads like a task list rather than chat log.
        val shaped = title.replaceFirstChar { if (it.isLowerCase()) it.titlecase() else it.toString() }
        return shaped.take(100)
    }
}
