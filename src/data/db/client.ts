import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync, deleteDatabaseSync, type SQLiteDatabase } from 'expo-sqlite';
import * as schema from './schema';

// Lazy, RETRYING open. The previous version opened at module load and treated
// a single failure as permanent for the process lifetime — one bad moment at
// startup silently killed every pipeline stage AND blanked the activity list,
// with no error surfaced anywhere. Now every db access retries the open, and
// initializeDatabase() throws the real error so the UI can display it.
let _sqlite: SQLiteDatabase | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _real: any = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ensureOpen(): any {
  if (_real) return _real;
  _sqlite = openDatabaseSync('taskmind.db');
  _real = drizzle(_sqlite, { schema });
  return _real;
}

// All existing call sites do `db.select()...` etc. — the proxy defers the
// open to first use and keeps retrying after earlier failures.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const db: any = new Proxy(
  {},
  {
    get(_target, prop) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const real = ensureOpen();
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const value = real[prop];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
      return typeof value === 'function' ? value.bind(real) : value;
    },
  }
);
export type Database = ReturnType<typeof drizzle<typeof schema>>;

/** Corruption-class errors — the file is damaged and will NEVER work again. */
function isCorruption(e: unknown): boolean {
  const s = String(e).toLowerCase();
  return s.includes('malformed') || s.includes('not a database') || s.includes('corrupt');
}

/** A task row rescued from a corrupt database, as raw column values. */
type SalvagedTask = Record<string, string | number | null>;

/**
 * Best-effort read of the tasks table out of a database that has already
 * failed to open cleanly.
 *
 * Since v3 the task list is the user's own data and lives only on the device,
 * so wiping the file on corruption is destructive in a way it never was in v2
 * (when tasks lived in Google Tasks and the local file was pure plumbing).
 * SQLite corruption is usually partial — one damaged page — so a plain SELECT
 * very often still succeeds. If it does not, we lose what we could not read,
 * which is strictly better than not trying.
 */
function salvageTasks(): SalvagedTask[] {
  try {
    return (_sqlite?.getAllSync('SELECT * FROM tasks;') as SalvagedTask[]) ?? [];
  } catch {
    return [];
  }
}

/** Re-inserts salvaged rows into the freshly created database. */
function restoreTasks(rows: SalvagedTask[]): number {
  if (rows.length === 0 || !_sqlite) return 0;
  let restored = 0;
  for (const row of rows) {
    try {
      const cols = Object.keys(row);
      if (cols.length === 0) continue;
      const placeholders = cols.map(() => '?').join(', ');
      _sqlite.runSync(
        `INSERT OR IGNORE INTO tasks (${cols.join(', ')}) VALUES (${placeholders});`,
        cols.map((c) => row[c] ?? null)
      );
      restored++;
    } catch {
      // A single unrecoverable row must not abort the whole restore.
    }
  }
  return restored;
}

/**
 * Deletes the damaged database (plus stray -wal/-shm journal files) so a
 * fresh one can be created. Callers must salvage anything irreplaceable
 * FIRST — see salvageTasks(). Hard crashes mid-write (the since-fixed OOM
 * and Android 15 service bugs) are the known way it got corrupted.
 */
function destroyCorruptDatabase(): void {
  try {
    _sqlite?.closeSync();
  } catch {
    /* already unusable */
  }
  _sqlite = null;
  _real = null;
  // The -wal/-shm journals MUST go with the main file: a stale WAL beside a
  // fresh database gets "recovered" into it on open, resurrecting the
  // corruption. deleteDatabaseSync is a plain by-name file delete under the
  // SQLite directory, so it removes the journals synchronously too.
  for (const name of ['taskmind.db', 'taskmind.db-wal', 'taskmind.db-shm']) {
    try {
      deleteDatabaseSync(name);
    } catch {
      /* file absent or still locked — best effort */
    }
  }
}

export function initializeDatabase(): void {
  try {
    initializeDatabaseOnce();
  } catch (e) {
    if (!isCorruption(e)) throw e;
    // The file is physically damaged — no retry can fix it. Rescue the user's
    // tasks if the damaged file will still yield them, then rebuild fresh.
    const rescued = salvageTasks();
    destroyCorruptDatabase();
    initializeDatabaseOnce();
    const restored = restoreTasks(rescued);
    try {
      const lost = rescued.length - restored;
      const detail =
        restored > 0
          ? `Corrupted database was auto-reset — ${restored} task(s) recovered` +
            (lost > 0 ? `, ${lost} lost` : '') +
            ', history cleared'
          : 'Corrupted database was auto-reset — pipeline restored, history cleared';
      _sqlite?.runSync(
        `INSERT INTO activity_log (source, label, outcome, detail, created_at)
         VALUES ('system', 'Storage', 'ERROR', ?, ?);`,
        [detail, Date.now()]
      );
    } catch {
      /* the reset itself succeeded; this note is best-effort */
    }
  }
}

function initializeDatabaseOnce(): void {
  ensureOpen(); // throws the real underlying error when SQLite cannot open
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

    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      title_key TEXT NOT NULL,
      notes TEXT,
      due_at INTEGER,
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      status TEXT NOT NULL DEFAULT 'ACTIVE',
      source_type TEXT NOT NULL,
      source_ref TEXT,
      source_label TEXT,
      source_app TEXT,
      confidence REAL,
      inference_origin TEXT,
      model_id TEXT,
      remote_id TEXT,
      sync_state TEXT NOT NULL DEFAULT 'LOCAL_ONLY',
      completed_at INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status_due ON tasks (status, due_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_created_at ON tasks (created_at);
    CREATE INDEX IF NOT EXISTS idx_tasks_sync_state ON tasks (sync_state);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_dedup
      ON tasks (source_type, source_ref, title_key);

    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      title_key TEXT NOT NULL,
      notes TEXT,
      due_at INTEGER,
      priority TEXT NOT NULL DEFAULT 'MEDIUM',
      source_type TEXT NOT NULL,
      source_ref TEXT,
      source_label TEXT,
      source_app TEXT,
      source_text TEXT,
      reasoning TEXT,
      confidence REAL,
      inference_origin TEXT,
      state TEXT NOT NULL DEFAULT 'PENDING',
      resolved_at INTEGER,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_review_state ON review_items (state, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_review_dedup
      ON review_items (source_type, source_ref, title_key);
  `);
}
