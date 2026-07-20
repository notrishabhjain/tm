package expo.modules.notificationlistener

import android.content.Context
import android.util.Log
import android.view.textclassifier.TextClassificationManager
import android.view.textclassifier.TextClassifier
import android.view.textclassifier.TextLinks
import java.util.Calendar

/**
 * On-device call transcript analyser.
 *
 * Used when all network LLM engines (Groq / OpenRouter / NVIDIA) are unavailable.
 * Extracts explicit commitments from a call transcript using two complementary
 * techniques:
 *
 *  1. Commit-verb patterns — English and Hindi/Hinglish first-person action
 *     phrases that signal the phone owner made a commitment ("I'll send",
 *     "main bhej dunga", "kar deta hoon", etc.).
 *
 *  2. Android TextClassifier — on HyperOS this is backed by Xiaomi's on-device
 *     AI and detects TYPE_DATE_TIME / TYPE_ADDRESS / TYPE_PHONE entities for
 *     due-date enrichment of extracted tasks.
 *
 * Limitations vs. LLM analysis:
 *  - Only catches EXPLICIT commits; implied tasks from conversation context are
 *    missed (e.g. "acha theek hai" as an answer without a commit verb).
 *  - Title is derived directly from the sentence, not rephrased to imperative.
 *  - Priority is heuristic (deadline proximity) rather than semantic.
 *
 * Output is a [NvidiaLlmClient.CallExtraction] so the caller can treat it
 * identically to any other extraction result.
 */
object LocalCallAnalyzer {

    private const val TAG = "LocalCallAnalyzer"

    // ── Commit-verb patterns ───────────────────────────────────────────────────

    // English: first-person future / volitional phrases
    private val EN_COMMIT = listOf(
        "i will ", "i'll ", "i will ", "i'd ", "let me ",
        "i can ", "i'll send", "i'll call", "i'll check", "i'll confirm",
        "i'll look", "i'll get", "i'll do", "i'll arrange", "i'll share",
        "i'll forward", "i'll make", "i'll remind", "i'll prepare",
        "i'll book", "i'll schedule", "i'll follow", "i'll update",
        "will do", "will send", "will check", "will call",
        "sure i", "yes i'll", "okay i'll", "fine i'll", "alright i'll",
        "i am going to", "i'm going to", "going to send", "going to check",
        "i need to", "i have to", "i must"
    )

    // Hindi/Hinglish: first-person commit forms (Latin script)
    private val HI_COMMIT = listOf(
        "main karunga", "main karungi", "main kar dunga", "main kar dungi",
        "main bhejunga", "main bhejungi", "main bhej dunga", "main bhej dungi",
        "main dekhta hoon", "main dekhti hoon", "main dekh leta hoon",
        "main dekh leti hoon", "main call karunga", "main call karonga",
        "main forward karunga", "main confirm karunga", "main remind karunga",
        "main update karunga", "main bata dunga", "main bata dungi",
        "main share karunga", "main de dunga", "main de dungi",
        "kar deta hoon", "kar deti hoon", "kar dunga", "kar dungi",
        "bhej deta hoon", "bhej deti hoon", "bhej dunga", "bhej dungi",
        "de deta hoon", "de deti hoon", "dekh leta hoon", "dekh leti hoon",
        "bata deta hoon", "bata deti hoon", "haan main", "theek hai main",
        "ok main", "acha main", "zaroor karunga", "zaroor karenge",
        "ho jayega", "kar lenge", "bhej denge", "dekh lenge",
        "main manage kar", "main handle kar", "main arrange kar"
    )

    // ── Deadline markers ───────────────────────────────────────────────────────

    private data class DeadlineMatch(val daysOffset: Int, val hour: Int)

    private data class DeadlinePattern(
        val regex: Regex,
        val offset: DeadlineMatch
    )

    private val DEADLINE_PATTERNS = listOf(
        DeadlinePattern(Regex("""aaj\b|today\b|tonight\b|abhi\b|immediately\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(0, 23)),
        DeadlinePattern(Regex("""\bkal\b|tomorrow\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(1, 18)),
        DeadlinePattern(Regex("""\bparso\b|day after tomorrow\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(2, 18)),
        DeadlinePattern(Regex("""\btaparso\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(3, 18)),
        DeadlinePattern(Regex("""next week\b|agli hafte\b|agle hafte\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(7, 18)),
        DeadlinePattern(Regex("""this week\b|is hafte\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(5, 18)),
        DeadlinePattern(Regex("""by friday\b|friday tak\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(daysTillWeekday(6), 18)),
        DeadlinePattern(Regex("""by monday\b|monday tak\b""", RegexOption.IGNORE_CASE),
            DeadlineMatch(daysTillWeekday(2), 18)),
    )

    // ── Urgency signals ────────────────────────────────────────────────────────

    private val URGENT_WORDS = setOf(
        "urgent", "urgently", "asap", "immediately", "abhi", "turant",
        "jaldi", "right now", "as soon as", "aaj hi", "aaj tak"
    )

    private val HIGH_WORDS = setOf(
        "kal", "tomorrow", "tonight", "by end of day", "eod", "kal tak",
        "aaj shaam", "by tonight", "by tomorrow", "important", "priority"
    )

    // ── Filler words to strip when building a title ───────────────────────────

    private val FILLER_PREFIXES = listOf(
        "haan ", "haan, ", "acha ", "theek hai ", "ok ", "okay ", "sure ",
        "yes ", "bilkul ", "zaroor ", "definitely ", "of course ",
        "main ", "so ", "and ", "but ", "well "
    )

    // ── Public API ─────────────────────────────────────────────────────────────

    /**
     * Analyse [transcript] and return extracted tasks + a basic summary.
     * [callTimeMs] is used to resolve relative deadlines ("kal" = call day + 1).
     * [callerLabel] is the other party's name/number for context in titles.
     *
     * Never throws — returns an empty extraction on any failure.
     */
    fun analyze(
        context: Context,
        transcript: String,
        callTimeMs: Long,
        callerLabel: String
    ): NvidiaLlmClient.CallExtraction {
        return try {
            analyzeInternal(context, transcript, callTimeMs, callerLabel)
        } catch (t: Throwable) {
            Log.w(TAG, "On-device analysis failed: ${t.message}")
            NvidiaLlmClient.CallExtraction(
                summary = "On-device analysis failed — transcript saved for retry.",
                topics = emptyList(),
                tasks = emptyList()
            )
        }
    }

    private fun analyzeInternal(
        context: Context,
        transcript: String,
        callTimeMs: Long,
        callerLabel: String
    ): NvidiaLlmClient.CallExtraction {
        val classifier = getClassifier(context)
        val sentences = splitIntoSentences(transcript)
        val tasks = mutableListOf<NvidiaLlmClient.ExtractedTask>()
        val seenTitles = mutableSetOf<String>()

        for (sentence in sentences) {
            val lower = sentence.lowercase()
            val isCommit = EN_COMMIT.any { lower.contains(it) } ||
                           HI_COMMIT.any { lower.contains(it) }
            if (!isCommit) continue

            val title = buildTitle(sentence, callerLabel)
            if (title.length < 8) continue

            // Near-duplicate suppression (same first 40 chars = same task)
            val titleKey = title.take(40).lowercase()
            if (titleKey in seenTitles) continue
            seenTitles += titleKey

            val priority = inferPriority(lower)
            val dueDateMs = inferDueDate(lower, callTimeMs, classifier, sentence)

            tasks += NvidiaLlmClient.ExtractedTask(
                title = title,
                priority = priority,
                dueDateMs = dueDateMs,
                assignedToMe = true,
                notes = "Offline analysis from call with $callerLabel — verify if correct"
            )
        }

        val topicWords = extractTopicWords(transcript)
        val summary = buildSummary(tasks, callerLabel)

        Log.d(TAG, "On-device analysis: ${tasks.size} tasks from ${sentences.size} sentences")
        return NvidiaLlmClient.CallExtraction(
            summary = summary,
            topics = topicWords,
            tasks = tasks
        )
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    private fun splitIntoSentences(text: String): List<String> {
        // Split on sentence-end punctuation, Devanagari danda (।), and newlines.
        // Keep segments reasonably long — very short segments are noise.
        return text.split(Regex("""[.!?।\n]+"""))
            .map { it.trim() }
            .filter { it.length >= 15 }
            .flatMap { seg ->
                // Also split long segments on comma-chains so each commitment
                // gets its own analysis window (e.g. "X karna hai, Y bhi karna hai")
                if (seg.length > 150) seg.split(Regex(""",\s*""")).filter { it.length >= 15 }
                else listOf(seg)
            }
    }

    private fun buildTitle(sentence: String, callerLabel: String): String {
        var s = sentence.trim()
        // Strip leading filler so the title starts with meaningful content
        var changed = true
        while (changed) {
            changed = false
            for (f in FILLER_PREFIXES) {
                if (s.lowercase().startsWith(f)) {
                    s = s.substring(f.length).trimStart()
                    changed = true
                    break
                }
            }
        }
        // Capitalise first char and cap at 60 chars
        s = s.replaceFirstChar { it.uppercaseChar() }
        return s.take(60).trimEnd(',', '.', ' ')
    }

    private fun inferPriority(lower: String): String {
        if (URGENT_WORDS.any { lower.contains(it) }) return "URGENT"
        if (HIGH_WORDS.any { lower.contains(it) }) return "HIGH"
        // Any deadline word → at least MEDIUM; no deadline → LOW
        if (DEADLINE_PATTERNS.any { it.regex.containsMatchIn(lower) }) return "MEDIUM"
        return "LOW"
    }

    private fun inferDueDate(
        lower: String,
        callTimeMs: Long,
        classifier: TextClassifier?,
        rawSentence: String
    ): Long? {
        // 1. Check our known deadline patterns first (fast and reliable)
        for (dp in DEADLINE_PATTERNS) {
            if (dp.regex.containsMatchIn(lower)) {
                val cal = Calendar.getInstance().apply {
                    timeInMillis = callTimeMs
                    add(Calendar.DAY_OF_YEAR, dp.offset.daysOffset)
                    set(Calendar.HOUR_OF_DAY, dp.offset.hour)
                    set(Calendar.MINUTE, 0)
                    set(Calendar.SECOND, 0)
                }
                return cal.timeInMillis
            }
        }

        // 2. TextClassifier date detection for more complex expressions
        // ("next Tuesday", "15 tarikh ko", etc.)
        if (classifier != null) {
            try {
                val req = TextLinks.Request.Builder(rawSentence).build()
                val links = classifier.generateLinks(req)
                for (link in links.links) {
                    val types = link.entities.map { it.entityType }
                    if (TextClassifier.TYPE_DATE_TIME in types ||
                        "date_time" in types
                    ) {
                        // TextClassifier doesn't resolve dates to timestamps —
                        // it only marks the span. Flag that a date exists so we
                        // can at least assign a default due date of +2 days.
                        val cal = Calendar.getInstance().apply {
                            timeInMillis = callTimeMs
                            add(Calendar.DAY_OF_YEAR, 2)
                            set(Calendar.HOUR_OF_DAY, 18)
                            set(Calendar.MINUTE, 0)
                        }
                        return cal.timeInMillis
                    }
                }
            } catch (_: Exception) { }
        }

        return null
    }

    private fun extractTopicWords(transcript: String): List<String> {
        // Simple noun/keyword extraction: capitalised words that aren't sentence-start
        val words = transcript.split(Regex("""\s+"""))
        val topics = mutableListOf<String>()
        for (i in 1 until words.size) {
            val w = words[i].trimEnd('.', ',', '?', '!')
            if (w.length >= 4 && w[0].isUpperCase() && w.all { it.isLetter() || it == '-' }) {
                topics += w
            }
        }
        return topics.distinct().take(5)
    }

    private fun buildSummary(tasks: List<NvidiaLlmClient.ExtractedTask>, callerLabel: String): String {
        return if (tasks.isEmpty()) {
            "No explicit action items detected in call with $callerLabel (offline analysis). " +
            "Transcript saved — open the app to re-analyse when connected."
        } else {
            "${tasks.size} action item${if (tasks.size == 1) "" else "s"} extracted from " +
            "call with $callerLabel using on-device analysis. Review tasks for accuracy."
        }
    }

    private fun getClassifier(context: Context): TextClassifier? {
        return try {
            context.getSystemService(TextClassificationManager::class.java)?.textClassifier
        } catch (_: Exception) { null }
    }

    private fun daysTillWeekday(target: Int): Int {
        val today = Calendar.getInstance().get(Calendar.DAY_OF_WEEK)
        var diff = target - today
        if (diff <= 0) diff += 7
        return diff
    }
}
