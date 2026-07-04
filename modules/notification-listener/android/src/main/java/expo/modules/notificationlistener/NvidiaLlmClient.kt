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

    private const val SYSTEM_PROMPT = """You are a phone-call analyst for a personal task manager used by an Indian professional. The transcript may be in Hindi, English, or Hinglish (mixed Hindi-English) and may contain speech-recognition errors — interpret the intended meaning, do not discard items because of imperfect transcription.

You will be told the date and time the call took place ("Call date"). Resolve ALL relative date/time expressions — "kal", "parso", "tomorrow", "next Monday", "aaj shaam", "by Friday", "in an hour" — against that call date, NOT today's date.

Return ONLY a valid JSON object, no markdown:
{
  "summary": "<2-3 sentence summary of what was discussed>",
  "topics": ["<short topic phrase>", ...],
  "tasks": [
    {
      "title": "<imperative verb phrase ≤60 chars, e.g. 'Send invoice to Rahul by Friday'>",
      "priority": "URGENT|HIGH|MEDIUM|LOW",
      "dueDate": "<ISO 8601 date-time resolved from call date, or null>",
      "assignedToMe": <true if the person who recorded this call must act, false if the other party committed>,
      "notes": "<names, amounts, references, context — null if nothing useful>"
    }
  ]
}

Find EVERY commitment, task, follow-up, and action item mentioned by either party. Be comprehensive.

Priority: URGENT = within 24h of the call or urgent/ASAP/abhi/aaj tak; HIGH = 2-3 days or important/kal tak; MEDIUM = no stated urgency; LOW = optional/"jab time mile".

Common Hindi/Hinglish action phrases: "bhej dena", "bhej do", "kar dena", "dekh lena", "bata dena", "call karna", "confirm karo", "meeting rakhna", "payment karna", "forward karna".

If no action items exist, return "tasks": []. Always include summary and topics."""

    /** Blocking — must be called off the main thread. */
    fun extract(
        apiKey: String,
        model: String,
        transcript: String,
        callTimeMs: Long,
        callerLabel: String
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

        val body = JSONObject().apply {
            put("model", model)
            put("temperature", 0.1)
            put("max_tokens", 1500)
            put("messages", JSONArray().apply {
                put(JSONObject().put("role", "system").put("content", SYSTEM_PROMPT))
                put(JSONObject().put("role", "user").put("content", userMessage))
            })
        }.toString()

        var lastError = "unknown"
        for (attempt in 1..MAX_ATTEMPTS) {
            try {
                val (status, response) = post(apiKey, body)
                if (status in 200..299) {
                    val content = JSONObject(response)
                        .optJSONArray("choices")?.optJSONObject(0)
                        ?.optJSONObject("message")?.optString("content")
                    if (content.isNullOrBlank()) return Result.Error("Empty LLM response")
                    val parsed = parseExtraction(content, callTimeMs)
                        ?: return Result.Error("Unparseable LLM response")
                    return Result.Success(parsed)
                }
                lastError = "HTTP $status"
                // Retry only on rate-limit / server errors; auth and bad-request are final.
                if (status != 429 && status < 500) return Result.Error(lastError)
            } catch (e: IOException) {
                lastError = "IO: ${e.message}"
            } catch (e: Exception) {
                return Result.Error("${e.javaClass.simpleName}: ${e.message}")
            }
            if (attempt < MAX_ATTEMPTS) Thread.sleep(RETRY_BACKOFF_MS)
        }
        Log.w(TAG, "LLM extraction failed after $MAX_ATTEMPTS attempts: $lastError")
        return Result.Error(lastError)
    }

    private fun post(apiKey: String, body: String): Pair<Int, String> {
        val conn = URL(ENDPOINT).openConnection() as HttpURLConnection
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
