package expo.modules.notificationlistener

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL
import java.text.SimpleDateFormat
import java.util.Calendar
import java.util.Date
import java.util.Locale

/**
 * Calls NVIDIA's hosted LLM (integrate.api.nvidia.com — REST, unlike the gRPC
 * ASR) to analyse a call transcript in one request: summary, topics, and
 * action-item tasks. Runs in the CallTranscriptionService worker thread so the
 * whole call→tasks pipeline completes in the background without the app open.
 *
 * The prompt mirrors src/services/transcript-extractor.ts (Hinglish guidance,
 * relative-date anchoring, priority rubric) but returns a single object with
 * summary and topics in addition to the task array.
 */
object NvidiaLlmClient {
    private const val TAG = "NvidiaLlmClient"
    private const val ENDPOINT = "https://integrate.api.nvidia.com/v1/chat/completions"
    internal const val GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions"
    internal const val OPENROUTER_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions"
    private const val CONNECT_TIMEOUT_MS = 10_000
    private const val READ_TIMEOUT_MS = 45_000
    private const val MAX_ATTEMPTS = 2
    private const val RETRY_BACKOFF_MS = 5_000L

    data class ExtractedTask(
        val title: String,
        val priority: String,           // URGENT | HIGH | MEDIUM | LOW
        val dueDateMs: Long?,
        val assignedToMe: Boolean,
        val notes: String?
    )

    data class CallExtraction(
        val summary: String,
        val topics: List<String>,
        val tasks: List<ExtractedTask>
    )

    sealed class Result {
        data class Success(val extraction: CallExtraction) : Result()
        data class Error(val message: String) : Result()
        object NoApiKey : Result()
    }

    private const val SYSTEM_PROMPT = """You are a precise phone-call analyst for a personal task manager used by an Indian professional. The transcript may be in Hindi, English, or Hinglish (mixed Hindi-English) and may contain speech-recognition errors — interpret the intended meaning.

You will be told the date and time the call took place ("Call date"). Resolve ALL relative date/time expressions — "kal", "parso", "tomorrow", "next Monday", "aaj shaam", "by Friday", "in an hour" — against that call date, NOT today's date.

Return ONLY a valid JSON object, no markdown. Fill "reasoning" FIRST — think through the call before extracting:
{
  "reasoning": "<briefly list each commitment you found, who made it, and its deadline — or state there are none>",
  "summary": "<2-3 sentence summary of what was discussed>",
  "topics": ["<short topic phrase>", ...],
  "tasks": [
    {
      "title": "<imperative verb phrase ≤60 chars quoting specifics from the call, e.g. 'Send GST invoice to Rahul by Friday'>",
      "priority": "URGENT|HIGH|MEDIUM|LOW",
      "dueDate": "<ISO 8601 date-time resolved from call date, or null>",
      "assignedToMe": <true if the person who recorded this call must act, false if the other party committed>,
      "notes": "<names, amounts, references, context — null if nothing useful>"
    }
  ]
}

PRECISION RULES (accuracy matters more than recall):
- Only extract commitments that were ACTUALLY SPOKEN. Never invent, infer, or embellish a task.
- Merge near-duplicate commitments into one task.
- If the transcript is garbled or ambiguous in a section, skip that section rather than guessing.
- Titles must reference concrete specifics from the call (names, amounts, documents) — never generic titles like "Follow up" alone.
- Small talk, opinions, and general discussion are NOT tasks. A task requires someone agreeing or being asked to DO something specific.

Priority: URGENT = within 24h of the call or urgent/ASAP/abhi/aaj tak; HIGH = 2-3 days or important/kal tak; MEDIUM = no stated urgency; LOW = optional/"jab time mile".

Common Hindi/Hinglish action phrases: "bhej dena", "bhej do", "kar dena", "dekh lena", "bata dena", "call karna", "confirm karo", "meeting rakhna", "payment karna", "forward karna".

EXAMPLE
Call date: Monday, 7 July 2025, 6:15 PM. Other party: Rahul.
Transcript: "Haan Rahul bol... invoice ka kya hua? ... theek hai main aaj raat tak bhej dunga GST wala invoice ... aur suno, kal subah 10 baje meeting hai client ke saath, tum join kar lena ... haan haan main aa jaunga ... aur woh 25000 ka payment Sharma ji ko remind kar dena parso tak"
Correct output:
{
  "reasoning": "Three commitments: (1) Rahul will send the GST invoice by tonight — his task, not mine. (2) I agreed to join the client meeting tomorrow 10 AM. (3) Rahul asked me to remind Sharma ji about the ₹25000 payment by day after tomorrow.",
  "summary": "Rahul confirmed he will send the GST invoice tonight. A client meeting is scheduled for tomorrow 10 AM which I agreed to join. I need to remind Sharma ji about the ₹25000 payment.",
  "topics": ["GST invoice", "Client meeting", "Sharma ji payment"],
  "tasks": [
    {"title": "Receive GST invoice from Rahul (he sends tonight)", "priority": "HIGH", "dueDate": "2025-07-07T23:59:00", "assignedToMe": false, "notes": "Rahul committed to send by tonight"},
    {"title": "Join client meeting at 10 AM", "priority": "HIGH", "dueDate": "2025-07-08T10:00:00", "assignedToMe": true, "notes": null},
    {"title": "Remind Sharma ji about ₹25000 payment", "priority": "MEDIUM", "dueDate": "2025-07-09T18:00:00", "assignedToMe": true, "notes": "Amount: ₹25000"}
  ]
}

If no action items exist, return "tasks": []. Always include reasoning, summary and topics."""

    private const val VERIFY_PROMPT = """You are a strict reviewer for tasks extracted from a phone-call transcript. You receive the transcript and a list of candidate tasks. For EACH candidate, check it against the transcript:
- keep: the commitment was clearly spoken and the title/date are accurate
- fix: the commitment is real but the title or dueDate needs correction — provide the corrected values
- drop: it was NOT actually committed to in the call, is a duplicate of another task, or is small talk misread as a task

Be strict: when in doubt, drop. Return ONLY valid JSON, no markdown:
{
  "verdicts": [
    {"index": <candidate index starting at 0>, "verdict": "keep|fix|drop", "title": "<corrected title if fix, else null>", "dueDate": "<corrected ISO date-time if fix, else null>", "reason": "<one short phrase>"}
  ]
}"""

    /** Convenience: extract via OpenRouter Llama 3.3 70B free tier. */
    fun extractWithOpenRouter(
        openrouterKey: String,
        transcript: String,
        callTimeMs: Long,
        callerLabel: String
    ): Result = extract(openrouterKey, "meta-llama/llama-3.3-70b-instruct:free", transcript, callTimeMs, callerLabel, OPENROUTER_ENDPOINT)

    /** Convenience: verify pass via OpenRouter Llama 3.3 70B free tier. */
    fun verifyWithOpenRouter(
        openrouterKey: String,
        transcript: String,
        extraction: CallExtraction,
        callTimeMs: Long
    ): CallExtraction = verify(openrouterKey, "meta-llama/llama-3.3-70b-instruct:free", transcript, extraction, callTimeMs, OPENROUTER_ENDPOINT)

    /** Convenience: extract via Groq Llama 3.3 70B. */
    fun extractWithGroq(
        groqKey: String,
        transcript: String,
        callTimeMs: Long,
        callerLabel: String
    ): Result = extract(groqKey, "llama-3.3-70b-versatile", transcript, callTimeMs, callerLabel, GROQ_ENDPOINT)

    /** Convenience: verify pass via Groq Llama 3.3 70B. */
    fun verifyWithGroq(
        groqKey: String,
        transcript: String,
        extraction: CallExtraction,
        callTimeMs: Long
    ): CallExtraction = verify(groqKey, "llama-3.3-70b-versatile", transcript, extraction, callTimeMs, GROQ_ENDPOINT)

    /** Blocking — must be called off the main thread. */
    fun extract(
        apiKey: String,
        model: String,
        transcript: String,
        callTimeMs: Long,
        callerLabel: String,
        endpoint: String = ENDPOINT
    ): Result {
        if (apiKey.isBlank()) return Result.NoApiKey

        val callDate = SimpleDateFormat("EEEE, d MMMM yyyy, h:mm a", Locale.ENGLISH)
            .format(Date(callTimeMs))
        val userMessage = buildString {
            append("Call date: ").append(callDate)
            append(" — resolve every relative date/time in the transcript against this moment.\n")
            append("Other party: ").append(callerLabel).append("\n")
            append("Call transcript:\n\n").append(transcript)
        }

        return when (val content = chatCompletion(apiKey, model, SYSTEM_PROMPT, userMessage, endpoint)) {
            is ChatResult.Content -> {
                val parsed = parseExtraction(content.text, callTimeMs)
                    ?: return Result.Error("Unparseable LLM response")
                Result.Success(parsed)
            }
            is ChatResult.Failure -> Result.Error(content.message)
        }
    }

    /**
     * Verification pass — re-checks every candidate task against the transcript
     * and keeps / fixes / drops each one. On any failure, returns the input
     * extraction unchanged (verification must never lose a successful pass 1).
     * Blocking — call off the main thread.
     */
    fun verify(
        apiKey: String,
        model: String,
        transcript: String,
        extraction: CallExtraction,
        callTimeMs: Long,
        endpoint: String = ENDPOINT
    ): CallExtraction {
        if (extraction.tasks.isEmpty()) return extraction
        return try {
            val candidates = JSONArray().apply {
                extraction.tasks.forEachIndexed { i, t ->
                    put(JSONObject().apply {
                        put("index", i)
                        put("title", t.title)
                        put("dueDate", t.dueDateMs?.let {
                            SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.US).format(Date(it))
                        } ?: JSONObject.NULL)
                        put("assignedToMe", t.assignedToMe)
                    })
                }
            }
            val userMessage = "Transcript:\n\n$transcript\n\nCandidate tasks:\n$candidates"
            val content = chatCompletion(apiKey, model, VERIFY_PROMPT, userMessage, endpoint)
            if (content !is ChatResult.Content) return extraction

            val start = content.text.indexOf('{')
            val end = content.text.lastIndexOf('}')
            if (start == -1 || end <= start) return extraction
            val verdicts = JSONObject(content.text.substring(start, end + 1))
                .optJSONArray("verdicts") ?: return extraction

            // Default keep — a task without a verdict survives.
            val kept = extraction.tasks.toMutableList()
            val dropIndices = mutableSetOf<Int>()
            for (i in 0 until verdicts.length()) {
                val v = verdicts.optJSONObject(i) ?: continue
                val idx = v.optInt("index", -1)
                if (idx !in extraction.tasks.indices) continue
                when (v.optString("verdict")) {
                    "drop" -> dropIndices.add(idx)
                    "fix" -> {
                        val old = kept[idx]
                        val newTitle = v.optString("title", "").trim()
                            .takeIf { it.isNotEmpty() && it != "null" } ?: old.title
                        val newDue = parseDueDate(v.optString("dueDate", ""), callTimeMs)
                            ?: old.dueDateMs
                        kept[idx] = old.copy(title = newTitle.take(120), dueDateMs = newDue)
                    }
                }
            }
            val filtered = kept.filterIndexed { i, _ -> i !in dropIndices }
            Log.i(TAG, "Verify pass: ${extraction.tasks.size} candidates → ${filtered.size} kept")
            extraction.copy(tasks = filtered)
        } catch (e: Exception) {
            Log.w(TAG, "Verify pass failed (${e.message}) — using pass-1 extraction")
            extraction
        }
    }

    private sealed class ChatResult {
        data class Content(val text: String) : ChatResult()
        data class Failure(val message: String) : ChatResult()
    }

    /** Shared chat-completion call with retry policy (429/5xx/IO only). */
    private fun chatCompletion(
        apiKey: String,
        model: String,
        systemPrompt: String,
        userMessage: String,
        endpoint: String = ENDPOINT
    ): ChatResult {
        val body = JSONObject().apply {
            put("model", model)
            put("temperature", 0.1)
            put("max_tokens", 2000)
            put("messages", JSONArray().apply {
                put(JSONObject().put("role", "system").put("content", systemPrompt))
                put(JSONObject().put("role", "user").put("content", userMessage))
            })
        }.toString()

        var lastError = "unknown"
        for (attempt in 1..MAX_ATTEMPTS) {
            try {
                val (status, response) = post(apiKey, body, endpoint)
                if (status in 200..299) {
                    val content = JSONObject(response)
                        .optJSONArray("choices")?.optJSONObject(0)
                        ?.optJSONObject("message")?.optString("content")
                    return if (content.isNullOrBlank()) ChatResult.Failure("Empty LLM response")
                    else ChatResult.Content(content)
                }
                lastError = "HTTP $status"
                // Retry only on rate-limit / server errors; auth and bad-request are final.
                if (status != 429 && status < 500) return ChatResult.Failure(lastError)
            } catch (e: IOException) {
                lastError = "IO: ${e.message}"
            } catch (e: Exception) {
                return ChatResult.Failure("${e.javaClass.simpleName}: ${e.message}")
            }
            if (attempt < MAX_ATTEMPTS) Thread.sleep(RETRY_BACKOFF_MS)
        }
        Log.w(TAG, "LLM call failed after $MAX_ATTEMPTS attempts: $lastError")
        return ChatResult.Failure(lastError)
    }

    private fun post(apiKey: String, body: String, endpoint: String = ENDPOINT): Pair<Int, String> {
        val conn = URL(endpoint).openConnection() as HttpURLConnection
        return try {
            conn.requestMethod = "POST"
            conn.connectTimeout = CONNECT_TIMEOUT_MS
            conn.readTimeout = READ_TIMEOUT_MS
            conn.doOutput = true
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("Authorization", "Bearer $apiKey")
            conn.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = conn.responseCode
            val stream = if (status in 200..299) conn.inputStream else conn.errorStream
            val text = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() } ?: ""
            status to text
        } finally {
            conn.disconnect()
        }
    }

    /**
     * Parses the model's content string into a CallExtraction. Pure function —
     * exercised via the diagnostics test flow. Returns null when the content
     * contains no parseable JSON object.
     */
    internal fun parseExtraction(raw: String, referenceTimeMs: Long): CallExtraction? {
        val start = raw.indexOf('{')
        val end = raw.lastIndexOf('}')
        if (start == -1 || end <= start) return null
        val obj = try {
            JSONObject(raw.substring(start, end + 1))
        } catch (_: Exception) {
            return null
        }

        val summary = obj.optString("summary", "").trim()
        val topics = mutableListOf<String>()
        obj.optJSONArray("topics")?.let { arr ->
            for (i in 0 until arr.length()) {
                arr.optString(i)?.trim()?.takeIf { it.isNotEmpty() }?.let { topics.add(it) }
            }
        }

        val tasks = mutableListOf<ExtractedTask>()
        obj.optJSONArray("tasks")?.let { arr ->
            for (i in 0 until arr.length()) {
                val t = arr.optJSONObject(i) ?: continue
                val title = t.optString("title", "").trim()
                if (title.isEmpty()) continue
                val priority = t.optString("priority", "MEDIUM").let {
                    if (it in setOf("URGENT", "HIGH", "MEDIUM", "LOW")) it else "MEDIUM"
                }
                val dueDateMs = parseDueDate(t.optString("dueDate", ""), referenceTimeMs)
                val notes = t.optString("notes", "").trim().takeIf {
                    it.isNotEmpty() && it != "null"
                }
                tasks.add(
                    ExtractedTask(
                        title = title.take(120),
                        priority = priority,
                        dueDateMs = dueDateMs,
                        assignedToMe = t.optBoolean("assignedToMe", true),
                        notes = notes
                    )
                )
            }
        }

        return CallExtraction(summary = summary, topics = topics, tasks = tasks)
    }

    /**
     * ISO date parsing with the same year-correction trick as the JS extractor:
     * small models sometimes hallucinate a past year — advance it until the
     * date is no more than 60 days before the call.
     */
    private fun parseDueDate(iso: String, referenceTimeMs: Long): Long? {
        if (iso.isBlank() || iso == "null") return null
        val formats = listOf(
            "yyyy-MM-dd'T'HH:mm:ssXXX",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd"
        )
        var parsed: Date? = null
        for (fmt in formats) {
            try {
                parsed = SimpleDateFormat(fmt, Locale.US).parse(iso)
                if (parsed != null) break
            } catch (_: Exception) { }
        }
        val date = parsed ?: return null

        val floor = referenceTimeMs - 60L * 86_400_000L
        val cal = Calendar.getInstance().apply { time = date }
        var guard = 0
        while (cal.timeInMillis < floor && guard < 10) {
            cal.add(Calendar.YEAR, 1)
            guard++
        }
        return cal.timeInMillis
    }
}
