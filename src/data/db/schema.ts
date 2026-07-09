import { sqliteTable, text, integer, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ── TaskMind v2 schema ────────────────────────────────────────────────────────
// The app is a pipe: notifications + calls → NVIDIA LLM → Google Tasks.
// There is NO local task list. Storage exists only for correctness plumbing:
// dedup, offline retry, call memory, conversation context, and the activity log.

// One row per transcribed phone call — the app's call memory. Written natively
// by CallRecordStore.kt; DDL must stay identical to its ensureTables().
export const callRecords = sqliteTable(
  'call_records',
  {
    id: text('id').primaryKey(),
    callerLabel: text('caller_label').notNull(),
    callerNumber: text('caller_number'),
    callTime: integer('call_time').notNull(),
    durationSec: integer('duration_sec'),
    recordingPath: text('recording_path'),
    transcript: text('transcript').notNull(),
    summary: text('summary'),
    topics: text('topics').notNull().default('[]'),
    taskIds: text('task_ids').notNull().default('[]'),
    status: text('status').notNull().default('TRANSCRIBED'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    createdAtIdx: index('idx_call_records_created_at').on(table.createdAt),
    recordingIdx: uniqueIndex('idx_call_records_recording').on(table.recordingPath),
  })
);

// Rolling conversation history per chat — gives the LLM full context instead of
// a single message, which is a large accuracy lever.
export const conversationMessages = sqliteTable(
  'conversation_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    conversationKey: text('conversation_key').notNull(), // "<pkg>::<chatTitle>"
    sender: text('sender').notNull(),
    text: text('text').notNull(),
    timestamp: integer('timestamp').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    convKeyIdx: index('idx_conv_msgs_key').on(table.conversationKey),
    convKeyTsIdx: uniqueIndex('idx_conv_msgs_key_ts_sender').on(
      table.conversationKey,
      table.timestamp,
      table.sender
    ),
  })
);

// Tasks awaiting Google Tasks creation. Rows are inserted by the JS pipeline
// (on network failure) and by the native call service, then flushed by the
// outbox sweep (headless task or app foreground). Deleted after success.
export const outbox = sqliteTable(
  'outbox',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    title: text('title').notNull(),
    notes: text('notes'),
    dueDate: integer('due_date'),
    createdAt: integer('created_at').notNull(),
    attempts: integer('attempts').notNull().default(0),
  },
  (table) => ({
    createdAtIdx: index('idx_outbox_created_at').on(table.createdAt),
  })
);

// Dedup ledger — notification identity hashes that were already processed.
// Prevents Android re-deliveries from creating the same Google task twice.
export const processedLedger = sqliteTable(
  'processed_ledger',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    fingerprint: text('fingerprint').notNull(),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    fingerprintIdx: uniqueIndex('idx_ledger_fingerprint').on(table.fingerprint),
    createdAtIdx: index('idx_ledger_created_at').on(table.createdAt),
  })
);

// Human-readable trail of everything the pipeline did — the app's only "UI data".
export const activityLog = sqliteTable(
  'activity_log',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').notNull(), // 'call' | package name
    label: text('label').notNull(), // caller / sender / app
    outcome: text('outcome').notNull(), // TASK_CREATED | SKIPPED | QUEUED | ERROR
    detail: text('detail').notNull(), // task title / skip reason / error
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    createdAtIdx: index('idx_activity_created_at').on(table.createdAt),
  })
);
