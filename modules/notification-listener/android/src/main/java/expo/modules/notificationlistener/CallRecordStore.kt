package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONArray
import java.io.File

/**
 * Writes call records and their extracted tasks directly into the app's
 * expo-sqlite database from the native side, so the whole call→tasks pipeline
 * completes while the JS process is dead. Read patterns mirror
 * TaskWidgetProvider.readPendingTasks(); the DB is WAL so a second writer is
 * safe with a busy timeout.
 *
 * DDL here must stay identical to the call_records block in
 * src/data/db/client.ts.
 */
object CallRecordStore {
    private const val TAG = "CallRecordStore"

    data class InsertResult(val callRecordId: String, val taskIds: List<String>)

    /** Returns null when the DB doesn't exist yet (fresh install, app never ran). */
    private fun open(context: Context): SQLiteDatabase? {
        val dbFile = File(context.filesDir, "SQLite/taskmind.db")
        if (!dbFile.exists()) {
            Log.w(TAG, "taskmind.db missing — app never launched; using fallback path")
            return null
        }
        return try {
            SQLiteDatabase.openDatabase(dbFile.absolutePath, null, SQLiteDatabase.OPEN_READWRITE)
                .also { it.execSQL("PRAGMA busy_timeout=5000") }
        } catch (e: Exception) {
            Log.w(TAG, "Failed to open DB: ${e.message}")
            null
        }
    }

    private fun ensureCallRecordsTable(db: SQLiteDatabase) {
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS call_records (
              id TEXT PRIMARY KEY NOT NULL,
              caller_label TEXT NOT NULL,
              caller_number TEXT,
              call_time INTEGER NOT NULL,
              duration_sec INTEGER,
              recording_path TEXT,
              transcript TEXT NOT NULL,
              summary TEXT,
              topics TEXT NOT NULL DEFAULT '[]',
              task_ids TEXT NOT NULL DEFAULT '[]',
              status TEXT NOT NULL DEFAULT 'TRANSCRIBED',
              created_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
        db.execSQL(
            "CREATE INDEX IF NOT EXISTS idx_call_records_created_at ON call_records (created_at)"
        )
        db.execSQL(
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_call_records_recording " +
                "ON call_records (recording_path) WHERE recording_path IS NOT NULL"
        )
    }

    // Matches TaskRepository.generateId() in src/data/repositories/TaskRepository.ts:
    // "<epoch ms>-<7 base36 chars>". Keep the two generators in lockstep.
    private var lastIdMs = 0L
    @Synchronized
    private fun generateId(): String {
        var ms = System.currentTimeMillis()
        if (ms <= lastIdMs) ms = lastIdMs + 1 // uniqueness inside tight loops
        lastIdMs = ms
        val rand = (1..7)
            .map { "abcdefghijklmnopqrstuvwxyz0123456789".random() }
            .joinToString("")
        return "$ms-$rand"
    }

    /**
     * Inserts the call record and its tasks in one transaction.
     * Returns null on any failure (caller falls back to the prefs-stash path).
     * Tasks are created as Review items: needs_confirmation=1.
     */
    fun insertCallRecordWithTasks(
        context: Context,
        caller: CallerResolver.ResolvedCaller,
        recordingPath: String,
        transcript: String,
        extraction: NvidiaLlmClient.CallExtraction?,   // null = TRANSCRIBED only (short call)
        callTimeMs: Long
    ): InsertResult? {
        val db = open(context) ?: return null
        return try {
            db.use { d ->
                ensureCallRecordsTable(d)
                d.beginTransaction()
                try {
                    val recordId = generateId()
                    val now = System.currentTimeMillis()
                    val taskIds = mutableListOf<String>()

                    if (extraction != null) {
                        for (task in extraction.tasks) {
                            val taskId = generateId()
                            val body = buildString {
                                if (!task.notes.isNullOrBlank()) {
                                    append(task.notes).append("\n\n")
                                }
                                append("Call with ").append(caller.label)
                                append("\n---\n")
                                append(transcript.take(2000))
                            }
                            val cv = ContentValues().apply {
                                put("id", taskId)
                                put("title", task.title)
                                put("body", body)
                                put("source_app", "call.transcript")
                                put("sender", caller.label)
                                put("priority", task.priority)
                                put("status", "PENDING")
                                put("confidence", 0.85)
                                put("rule_score", 0.0)
                                put("language", "EN")
                                put("matched_keywords", "[\"call_transcript\",\"ai_classifier\"]")
                                put("needs_confirmation", 1)
                                if (task.dueDateMs != null) put("due_date", task.dueDateMs)
                                put("created_at", now)
                            }
                            if (d.insert("tasks", null, cv) != -1L) taskIds.add(taskId)
                        }
                    }

                    val recordCv = ContentValues().apply {
                        put("id", recordId)
                        put("caller_label", caller.label)
                        if (caller.number != null) put("caller_number", caller.number)
                        put("call_time", callTimeMs)
                        if (caller.durationSec != null) put("duration_sec", caller.durationSec)
                        put("recording_path", recordingPath)
                        put("transcript", transcript)
                        if (extraction != null) {
                            put("summary", extraction.summary)
                            put("topics", JSONArray(extraction.topics).toString())
                            put("status", "EXTRACTED")
                        } else {
                            put("status", "TRANSCRIBED")
                        }
                        put("task_ids", JSONArray(taskIds).toString())
                        put("created_at", now)
                    }
                    // CONFLICT_IGNORE: unique recording_path index is the
                    // double-processing guard — a second run becomes a no-op.
                    val rowId = d.insertWithOnConflict(
                        "call_records", null, recordCv, SQLiteDatabase.CONFLICT_IGNORE
                    )
                    if (rowId == -1L) {
                        Log.d(TAG, "Recording already has a call_record — skipping")
                        return null
                    }

                    d.setTransactionSuccessful()
                    InsertResult(recordId, taskIds)
                } finally {
                    d.endTransaction()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "insertCallRecordWithTasks failed: ${e.message}")
            null
        }
    }
}
