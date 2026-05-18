/**
 * Drizzle ORM schema for TaskMind.
 * All 7 tables per SRS Section 5.1.
 */
import {
  index,
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

// ─────────────────────────────────────────────
// tasks
// ─────────────────────────────────────────────
export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(), // UUID
    text: text('text').notNull(),
    rawSourceText: text('raw_source_text').notNull(),
    priority: text('priority').notNull(), // URGENT | HIGH | MEDIUM | LOW
    status: text('status').notNull(), // PENDING | AWAITING_CONFIRMATION | COMPLETED | DELETED
    sourceApp: text('source_app').notNull(),
    sourceAppDisplay: text('source_app_display').notNull(),
    sender: text('sender'),
    createdAt: integer('created_at').notNull(),
    completedAt: integer('completed_at'),
    deletedAt: integer('deleted_at'),
    dueAt: integer('due_at'),
    triggerKeywords: text('trigger_keywords').notNull(), // JSON array
    confidence: real('confidence').notNull(),
    ruleScore: real('rule_score').notNull(),
    modelScore: real('model_score'),
    needsConfirmation: integer('needs_confirmation', { mode: 'boolean' }).notNull(),
    calendarEventId: text('calendar_event_id'),
    language: text('language').notNull(), // en | hi | hi-en
  },
  (table) => ({
    createdAtIdx: index('idx_tasks_created_at').on(table.createdAt),
    statusIdx: index('idx_tasks_status').on(table.status),
    priorityIdx: index('idx_tasks_priority').on(table.priority),
  }),
);

// ─────────────────────────────────────────────
// vip_contacts
// ─────────────────────────────────────────────
export const vipContacts = sqliteTable('vip_contacts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  createdAt: integer('created_at').notNull(),
});

// ─────────────────────────────────────────────
// monitored_apps
// ─────────────────────────────────────────────
export const monitoredApps = sqliteTable('monitored_apps', {
  packageName: text('package_name').primaryKey(),
  displayName: text('display_name').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull(),
  addedAt: integer('added_at').notNull(),
});

// ─────────────────────────────────────────────
// seed_keywords
// ─────────────────────────────────────────────
export const seedKeywords = sqliteTable('seed_keywords', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  phrase: text('phrase').notNull(),
  category: text('category').notNull(), // IMPERATIVE | URGENCY | DEADLINE | REQUEST | ANTI_PATTERN | DOMAIN
  language: text('language').notNull(), // en | hi | hi-en
  weight: real('weight').notNull().default(1.0),
});

// ─────────────────────────────────────────────
// learned_keywords
// ─────────────────────────────────────────────
export const learnedKeywords = sqliteTable(
  'learned_keywords',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    phrase: text('phrase').notNull(),
    category: text('category').notNull(),
    language: text('language').notNull(),
    frequency: integer('frequency').notNull().default(0),
    weight: real('weight').notNull().default(0.5),
    confirmCount: integer('confirm_count').notNull().default(0),
    deleteCount: integer('delete_count').notNull().default(0),
    status: text('status').notNull(), // PENDING | ACTIVE | DEMOTED
    firstSeen: integer('first_seen').notNull(),
    lastUsed: integer('last_used').notNull(),
  },
  (table) => ({
    uniquePhraseIdx: uniqueIndex('idx_phrase_lang').on(table.phrase, table.language),
  }),
);

// ─────────────────────────────────────────────
// sender_stats
// ─────────────────────────────────────────────
export const senderStats = sqliteTable(
  'sender_stats',
  {
    senderName: text('sender_name').notNull(),
    sourceApp: text('source_app').notNull(),
    tasksCreated: integer('tasks_created').notNull().default(0),
    tasksConfirmed: integer('tasks_confirmed').notNull().default(0),
    tasksDeleted: integer('tasks_deleted').notNull().default(0),
    tasksCompleted: integer('tasks_completed').notNull().default(0),
    firstSeen: integer('first_seen').notNull(),
    lastSeen: integer('last_seen').notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.senderName, table.sourceApp] }),
  }),
);

// ─────────────────────────────────────────────
// discarded_log  (capped at 500 rows)
// ─────────────────────────────────────────────
export const discardedLog = sqliteTable('discarded_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  sourceApp: text('source_app').notNull(),
  sender: text('sender'),
  confidence: real('confidence').notNull(),
  reason: text('reason').notNull(), // LOW_CONFIDENCE | ANTI_PATTERN | TOO_SHORT
  timestamp: integer('timestamp').notNull(),
});

// ─────────────────────────────────────────────
// training_log
// ─────────────────────────────────────────────
export const trainingLog = sqliteTable('training_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  text: text('text').notNull(),
  label: text('label').notNull(), // TASK | NOT_TASK
  source: text('source').notNull(), // user_confirm | user_delete | user_complete
  timestamp: integer('timestamp').notNull(),
});
