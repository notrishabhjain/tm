package expo.modules.notificationlistener

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.util.Log
import org.json.JSONArray
import java.io.File

/**
 * Native SQLite writer for the v2 pipeline. Writes:
 *  - call_records  (call memory: transcript, summary, topics)
 *  - outbox        (tasks waiting for Google Tasks creation — flushed by JS)
 *  - activity_log  (the status screen's trail)
 * DDL must stay identical to src/data/db/client.ts. The DB is WAL, so a second
 * writer is safe with a busy timeout.
 */
object CallRecordStore {
    private const val TAG = "CallRecordStore"

    private fun open(context: Context): SQLiteDatabase? {
        val dbFile = File(context.filesDir, "SQLite/taskmind.db")
        if (!dbFile.exists()) {
            Log.w(TAG, "taskmind.db missing — app never launched")
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

    private fun ensureTables(db: SQLiteDatabase) {
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
            "CREATE UNIQUE INDEX IF NOT EXISTS idx_call_records_recording " +
                "ON call_records (recording_path) WHERE recording_path IS NOT NULL"
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS outbox (
              id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
              title TEXT NOT NULL,
              notes TEXT,
              due_date INTEGER,
              created_at INTEGER NOT NULL,
              attempts INTEGER NOT NULL DEFAULT 0
            )
            """.trimIndent()
        )
        db.execSQL(
            """
            CREATE TABLE IF NOT EXISTS activity_log (
              id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
              source TEXT NOT NULL,
              label TEXT NOT NULL,
              outcome TEXT NOT NULL,
              detail TEXT NOT NULL,
              created_at INTEGER NOT NULL
            )
            """.trimIndent()
        )
    }

    // Matches the JS id format "<epoch ms>-<7 base36 chars>".
    private var lastIdMs = 0L
    @Synchronized
    private fun generateId(): String {
        var ms = System.currentTimeMillis()
        if (ms <= lastIdMs) ms = lastIdMs + 1
        lastIdMs = ms
        val rand = (1..7)
            .map { "abcdefghijklmnopqrstuvwxyz0123456789".random() }
            .joinToString("")
        return "$ms-$rand"
    }

    /**
     * Stores the call record and queues its tasks in the outbox, in one
     * transaction. Returns the number of tasks queued, or -1 on failure
     * (including "recording already processed" via the unique index).
     */
    fun storeCallResult(
        context: Context,
        caller: CallerResolver.ResolvedCaller,
        recordingPath: String,
        transcript: String,
        extraction: NvidiaLlmClient.CallExtraction?, // null = short call, stored silently
        callTimeMs: Long
    ): Int {
        val db = open(context) ?: return -1
        return try {
            db.use { d ->
                ensureTables(d)
                d.beginTransaction()
                try {
                    val recordCv = ContentValues().apply {
                        put("id", generateId())
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
                        put("created_at", System.currentTimeMillis())
                    }
                    val rowId = d.insertWithOnConflict(
                        "call_records", null, recordCv, SQLiteDatabase.CONFLICT_IGNORE
                    )
                    if (rowId == -1L) {
                        Log.d(TAG, "Recording already processed — skipping")
                        return -1
                    }

                    var queued = 0
                    if (extraction != null) {
                        for (task in extraction.tasks) {
                            val notes = buildString {
                                append("Priority: ").append(task.priority).append('\n')
                                append("From: ").append(caller.label).append(" · Phone call\n")
                                if (!task.notes.isNullOrBlank()) {
                                    append("Notes: ").append(task.notes).append('\n')
                                }
                                append("---\n")
                                append(extraction.summary.take(300))
                            }
                            val cv = ContentValues().apply {
                                put("title", task.title)
                                put("notes", notes)
                                if (task.dueDateMs != null) put("due_date", task.dueDateMs)
                                put("created_at", System.currentTimeMillis())
                            }
                            if (d.insert("outbox", null, cv) != -1L) queued++
                        }
                    }

                    d.setTransactionSuccessful()
                    queued
                } finally {
                    d.endTransaction()
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "storeCallResult failed: ${e.message}")
            -1
        }
    }

    /** True when this recording path was already stored (i.e. fully processed). */
    fun hasRecording(context: Context, path: String): Boolean {
        val db = open(context) ?: return false
        return try {
            db.use { d ->
                ensureTables(d)
                d.rawQuery(
                    "SELECT 1 FROM call_records WHERE recording_path = ? LIMIT 1",
                    arrayOf(path)
                ).use { it.moveToFirst() }
            }
        } catch (e: Exception) {
            Log.w(TAG, "hasRecording failed: ${e.message}")
            false
        }
    }

    /**
     * Stores a stub record for a recording that failed deterministically
     * (e.g. an undecodable file) so recovery sweeps stop retrying it. Uses the
     * same unique recording_path index as real records for dedup.
     */
    fun storeFailedRecording(context: Context, path: String, reason: String) {
        val db = open(context) ?: return
        try {
            db.use { d ->
                ensureTables(d)
                d.insertWithOnConflict(
                    "call_records", null,
                    ContentValues().apply {
                        put("id", generateId())
                        put("caller_label", "Unknown")
                        put("call_time", System.currentTimeMillis())
                        put("recording_path", path)
                        put("transcript", "")
                        put("summary", reason.take(200))
                        put("status", "ERROR")
                        put("created_at", System.currentTimeMillis())
                    },
                    SQLiteDatabase.CONFLICT_IGNORE
                )
            }
        } catch (e: Exception) {
            Log.w(TAG, "storeFailedRecording failed: ${e.message}")
        }
    }

    /** Appends a row to the activity log (best-effort). */
    fun logActivity(context: Context, source: String, label: String, outcome: String, detail: String) {
        val db = open(context) ?: return
        try {
            db.use { d ->
                ensureTables(d)
                d.insert("activity_log", null, ContentValues().apply {
                    put("source", source)
                    put("label", label.take(80))
                    put("outcome", outcome)
                    put("detail", detail.take(200))
                    put("created_at", System.currentTimeMillis())
                })
            }
        } catch (e: Exception) {
            Log.w(TAG, "logActivity failed: ${e.message}")
        }
    }
}
