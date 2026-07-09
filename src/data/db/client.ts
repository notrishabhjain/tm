import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

let _sqlite: SQLiteDatabase | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: any = null;
let _openError: unknown = null;

try {
  _sqlite = openDatabaseSync('taskmind.db');
  _db = drizzle(_sqlite, { schema });
} catch (e) {
  _openError = e;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db = _db as any;
export type Database = ReturnType<typeof drizzle<typeof schema>>;

export function initializeDatabase(): void {
  if (_openError !== null) {
    throw _openError instanceof Error ? _openError : new Error(String(_openError));
  }
  if (!_sqlite) {
    throw new Error('SQLite failed to open');
  }
  // Use execSync to avoid the New Architecture async-queue issue where
  // execAsync promises may never resolve when running on Queues.DEFAULT.
  _sqlite.execSync(`PRAGMA journal_mode=WAL;`);
  _sqlite.execSync(`
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
    );
    CREATE INDEX IF NOT EXISTS idx_call_records_created_at ON call_records (created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_call_records_recording
      ON call_records (recording_path) WHERE recording_path IS NOT NULL;

    CREATE TABLE IF NOT EXISTS conversation_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      conversation_key TEXT NOT NULL,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_conv_msgs_key ON conversation_messages (conversation_key);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_conv_msgs_key_ts_sender ON conversation_messages (conversation_key, timestamp, sender);

    CREATE TABLE IF NOT EXISTS outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      title TEXT NOT NULL,
      notes TEXT,
      due_date INTEGER,
      created_at INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox (created_at);

    CREATE TABLE IF NOT EXISTS processed_ledger (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ledger_fingerprint ON processed_ledger (fingerprint);
    CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON processed_ledger (created_at);

    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      source TEXT NOT NULL,
      label TEXT NOT NULL,
      outcome TEXT NOT NULL,
      detail TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activity_created_at ON activity_log (created_at);
  `);
}
