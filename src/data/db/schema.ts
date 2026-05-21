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
    screenshotPath: text('screenshot_path'),
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

export const discardedLog = sqliteTable('discarded_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  notificationId: text('notification_id').notNull().default(''),
  sourceApp: text('source_app').notNull(),
  sender: text('sender'),
  bodyPreview: text('body_preview').notNull(),
  reason: text('reason').notNull(), // LOW_CONFIDENCE | ANTI_PATTERN | TOO_SHORT | FILTERED
  confidence: real('confidence').notNull(),
  createdAt: integer('created_at').notNull(),
});
