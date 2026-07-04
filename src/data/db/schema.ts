import { sqliteTable, text, integer, real, index, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    title: text('title').notNull(),
    body: text('body'),
    sourceApp: text('source_app').notNull(),
    sender: text('sender'),
    priority: text('priority').notNull(), // URGENT | HIGH | MEDIUM | LOW
    status: text('status').notNull().default('PENDING'), // PENDING | COMPLETE | ARCHIVED
    confidence: real('confidence').notNull(),
    ruleScore: real('rule_score').notNull().default(0),
    modelScore: real('model_score'),
    language: text('language').notNull().default('EN'),
    matchedKeywords: text('matched_keywords').notNull().default('[]'),
    needsConfirmation: integer('needs_confirmation', { mode: 'boolean' }).notNull().default(false),
    calendarEventId: text('calendar_event_id'),
    dueDate: integer('due_date'),
    notificationKey: text('notification_key'),
    googleTaskId: text('google_task_id'),
    howTo: text('how_to'),
    estimatedMinutes: integer('estimated_minutes'),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
    deletedAt: integer('deleted_at'),
  },
  (table) => ({
    createdAtIdx: index('idx_tasks_created_at').on(table.createdAt),
    statusIdx: index('idx_tasks_status').on(table.status),
    priorityIdx: index('idx_tasks_priority').on(table.priority),
    confirmIdx: index('idx_tasks_needs_confirmation').on(table.needsConfirmation),
    deletedAtIdx: index('idx_tasks_deleted_at').on(table.deletedAt),
    notificationKeyIdx: index('idx_tasks_nk').on(table.notificationKey),
  })
);

export const vipContacts = sqliteTable('vip_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  identifier: text('identifier').notNull(),
  displayName: text('display_name').notNull(),
  sourceApp: text('source_app').notNull().default('*'),
  createdAt: integer('created_at').notNull(),
});

export const monitoredApps = sqliteTable('monitored_apps', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageName: text('package_name').notNull(),
  displayName: text('display_name').notNull(),
  isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
});

export const seedKeywords = sqliteTable(
  'seed_keywords',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    keyword: text('keyword').notNull(),
    language: text('language').notNull(), // EN | HI | HI-EN
    priorityHint: text('priority_hint').notNull().default('MEDIUM'),
    category: text('category').notNull().default('IMPERATIVE'),
    weight: real('weight').notNull().default(1.0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    uniqueKwLang: uniqueIndex('idx_seed_kw_lang').on(table.keyword, table.language),
  })
);

export const learnedKeywords = sqliteTable(
  'learned_keywords',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    ngram: text('ngram').notNull(),
    weight: real('weight').notNull().default(0.5),
    language: text('language').notNull(),
    occurrenceCount: integer('occurrence_count').notNull().default(0),
    status: text('status').notNull().default('PENDING'), // PENDING | ACTIVE | DEMOTED
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    uniqueNgramLang: uniqueIndex('idx_learned_ngram_lang').on(table.ngram, table.language),
  })
);

export const senderStats = sqliteTable(
  'sender_stats',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    senderKey: text('sender_key').notNull(),
    confirmCount: integer('confirm_count').notNull().default(0),
    rejectCount: integer('reject_count').notNull().default(0),
    autoAcceptCount: integer('auto_accept_count').notNull().default(0),
    lastSeenAt: integer('last_seen_at').notNull(),
    // Signal engine additions
    tier: text('tier').notNull().default('UNKNOWN'), // VIP_WORK|WORK|VIP_PERSONAL|INFO|UNKNOWN
    seedTrust: real('seed_trust'), // pre-seeded trust 0-1, null = use computed
  },
  (table) => ({
    senderKeyIdx: uniqueIndex('idx_sender_stats_key').on(table.senderKey),
  })
);

export const trainingLog = sqliteTable('training_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  taskId: text('task_id').notNull(),
  action: text('action').notNull(), // CONFIRMED | REJECTED | COMPLETED | DELETED
  ngramsExtracted: text('ngrams_extracted').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
});

// Rolling conversation history — persists WhatsApp/messaging thread messages so the
// AI classifier can see full conversation context beyond the OS-delivered thread window.
export const conversationMessages = sqliteTable(
  'conversation_messages',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // Identifies a single chat: "<packageName>::<chatTitle>" e.g. "com.whatsapp::Rahul"
    conversationKey: text('conversation_key').notNull(),
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

// One row per transcribed phone call — the app's call memory. Written natively
// by CallRecordStore.kt (background pipeline) and read by CallRecordRepository.
// DDL must stay identical to CallRecordStore.ensureCallRecordsTable.
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
    status: text('status').notNull().default('TRANSCRIBED'), // TRANSCRIBED | EXTRACTED | REVIEWED
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    createdAtIdx: index('idx_call_records_created_at').on(table.createdAt),
    recordingIdx: uniqueIndex('idx_call_records_recording').on(table.recordingPath),
  })
);

export const discardedLog = sqliteTable('discarded_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  notificationId: text('notification_id').notNull().default(''),
  notificationKey: text('notification_key'),
  sourceApp: text('source_app').notNull(),
  sender: text('sender'),
  bodyPreview: text('body_preview').notNull(),
  reason: text('reason').notNull(), // LOW_CONFIDENCE | ANTI_PATTERN | TOO_SHORT | FILTERED
  confidence: real('confidence').notNull(),
  createdAt: integer('created_at').notNull(),
});
