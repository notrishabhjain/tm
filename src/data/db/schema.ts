import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

// ── TaskMind v3 schema ────────────────────────────────────────────────────────
// Notifications + calls → on-device classification → tasks IN THIS APP.
// The local `tasks` table is the authoritative record; Google Tasks is an
// optional mirror (off by default). Everything else is correctness plumbing:
// dedup, offline retry, call memory, conversation context, and the activity log.

/**
 * The user's task list — the app's primary object.
 *
 * Written from three places, so the shape has to survive all of them:
 *  - the JS notification pipeline (live or headless),
 *  - the JS call pipeline,
 *  - the native call service, which writes directly when no JS context exists.
 * The native DDL in CallRecordStore.kt MUST stay identical to the SQL in
 * client.ts — the two create the same table from different processes.
 */
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    // Normalised title used only for deduplication (lowercased, punctuation and
    // filler stripped). Kept as a column so the unique index below can enforce
    // dedup in the database rather than trusting every caller to check first.
    titleKey: text('title_key').notNull(),
    notes: text('notes'),
    dueAt: integer('due_at'),
    priority: text('priority').notNull().default('MEDIUM'), // URGENT|HIGH|MEDIUM|LOW
    status: text('status').notNull().default('ACTIVE'), // ACTIVE|COMPLETED|DELETED
    sourceType: text('source_type').notNull(), // NOTIFICATION|CALL|MANUAL|REVIEW
    // Identity of the thing this came from: a notification fingerprint or a
    // call_records.id. NULL for manual tasks — and NULL is what makes the dedup
    // index below ignore them, so a user may create the same task twice on purpose.
    sourceRef: text('source_ref'),
    // Denormalised on purpose: the sender/caller label must survive retention
    // purging of the conversation or transcript that produced the task.
    sourceLabel: text('source_label'),
    sourceApp: text('source_app'), // package name, or 'call'
    confidence: real('confidence'),
    inferenceOrigin: text('inference_origin'), // LOCAL_HEURISTIC|LOCAL_LLM|CLOUD|MANUAL
    modelId: text('model_id'),
    remoteId: text('remote_id'), // Google Tasks id once mirrored
    syncState: text('sync_state').notNull().default('LOCAL_ONLY'), // LOCAL_ONLY|PENDING|SYNCED|FAILED
    completedAt: integer('completed_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    statusDueIdx: index('idx_tasks_status_due').on(table.status, table.dueAt),
    createdAtIdx: index('idx_tasks_created_at').on(table.createdAt),
    syncStateIdx: index('idx_tasks_sync_state').on(table.syncState),
    // The dedup guarantee: one task per (source, normalised title). A notification
    // re-delivery or a second pass over the same call transcript collides here
    // instead of creating a duplicate.
    dedupIdx: uniqueIndex('idx_tasks_dedup').on(table.sourceType, table.sourceRef, table.titleKey),
  })
);

/**
 * Extractions the classifier was not confident enough to turn into tasks.
 *
 * This is the safety valve for a small on-device model: rather than choose
 * between a wrong task and a dropped commitment, uncertain results wait here
 * for a one-tap accept or dismiss.
 */
export const reviewItems = sqliteTable(
  'review_items',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    titleKey: text('title_key').notNull(),
    notes: text('notes'),
    dueAt: integer('due_at'),
    priority: text('priority').notNull().default('MEDIUM'),
    sourceType: text('source_type').notNull(),
    sourceRef: text('source_ref'),
    sourceLabel: text('source_label'),
    sourceApp: text('source_app'),
    // The message or transcript excerpt that produced this, so the user can
    // judge it without leaving the app. Truncated on write.
    sourceText: text('source_text'),
    reasoning: text('reasoning'),
    confidence: real('confidence'),
    inferenceOrigin: text('inference_origin'),
    state: text('state').notNull().default('PENDING'), // PENDING|ACCEPTED|DISMISSED|EXPIRED
    resolvedAt: integer('resolved_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    stateIdx: index('idx_review_state').on(table.state, table.createdAt),
    dedupIdx: uniqueIndex('idx_review_dedup').on(table.sourceType, table.sourceRef, table.titleKey),
  })
);

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
