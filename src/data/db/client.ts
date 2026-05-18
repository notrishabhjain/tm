import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

const sqlite = openDatabaseSync('taskmind.db', { enableChangeListener: true });

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;

export async function initializeDatabase(): Promise<void> {
  // Run migrations manually since drizzle-kit expo migration format may vary
  // We execute the initial SQL directly on first run
  await sqlite.execAsync(`PRAGMA journal_mode=WAL;`);
  await sqlite.execAsync(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      source_app TEXT NOT NULL,
      sender TEXT,
      priority TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'PENDING',
      confidence REAL NOT NULL,
      rule_score REAL NOT NULL DEFAULT 0,
      model_score REAL,
      language TEXT NOT NULL DEFAULT 'EN',
      matched_keywords TEXT NOT NULL DEFAULT '[]',
      needs_confirmation INTEGER NOT NULL DEFAULT 0,
      calendar_event_id TEXT,
      created_at INTEGER NOT NULL,
      completed_at INTEGER,
      deleted_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks (status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks (priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_needs_confirmation ON tasks (needs_confirmation);

    CREATE TABLE IF NOT EXISTS vip_contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      identifier TEXT NOT NULL,
      display_name TEXT NOT NULL,
      source_app TEXT NOT NULL DEFAULT '*',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS monitored_apps (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      package_name TEXT NOT NULL,
      display_name TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS seed_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      keyword TEXT NOT NULL,
      language TEXT NOT NULL,
      priority_hint TEXT NOT NULL DEFAULT 'MEDIUM',
      category TEXT NOT NULL DEFAULT 'IMPERATIVE',
      weight REAL NOT NULL DEFAULT 1.0,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_seed_kw_lang ON seed_keywords (keyword, language);

    CREATE TABLE IF NOT EXISTS learned_keywords (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      ngram TEXT NOT NULL,
      weight REAL NOT NULL DEFAULT 0.5,
      language TEXT NOT NULL,
      occurrence_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_learned_ngram_lang ON learned_keywords (ngram, language);

    CREATE TABLE IF NOT EXISTS sender_stats (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      sender_key TEXT NOT NULL,
      confirm_count INTEGER NOT NULL DEFAULT 0,
      reject_count INTEGER NOT NULL DEFAULT 0,
      auto_accept_count INTEGER NOT NULL DEFAULT 0,
      last_seen_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sender_stats_key ON sender_stats (sender_key);

    CREATE TABLE IF NOT EXISTS training_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      task_id TEXT NOT NULL,
      action TEXT NOT NULL,
      ngrams_extracted TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS discarded_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      notification_id TEXT NOT NULL DEFAULT '',
      source_app TEXT NOT NULL,
      sender TEXT,
      body_preview TEXT NOT NULL,
      reason TEXT NOT NULL,
      confidence REAL NOT NULL,
      created_at INTEGER NOT NULL
    );
  `);
}
