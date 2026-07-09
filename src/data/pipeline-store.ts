import { desc, eq, lt, sql } from 'drizzle-orm';
import { db } from './db/client';
import { activityLog, outbox, processedLedger } from './db/schema';

// ── Dedup ledger ──────────────────────────────────────────────────────────────

const LEDGER_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Returns true when this fingerprint was seen before; records it otherwise.
 * Atomic via the unique index — safe against concurrent redeliveries.
 */
export async function checkAndRecordFingerprint(fingerprint: string): Promise<boolean> {
  try {
    await db.insert(processedLedger).values({ fingerprint, createdAt: Date.now() });
    // Opportunistic prune of old entries
    void db
      .delete(processedLedger)
      .where(lt(processedLedger.createdAt, Date.now() - LEDGER_RETENTION_MS))
      .catch?.(() => {});
    return false;
  } catch {
    return true; // unique violation = already processed
  }
}

// ── Activity log ──────────────────────────────────────────────────────────────

export type ActivityOutcome = 'TASK_CREATED' | 'SKIPPED' | 'QUEUED' | 'ERROR';

export interface ActivityEntry {
  id: number;
  source: string;
  label: string;
  outcome: ActivityOutcome;
  detail: string;
  createdAt: number;
}

const ACTIVITY_CAP = 300;

export async function logActivity(
  source: string,
  label: string,
  outcome: ActivityOutcome,
  detail: string
): Promise<void> {
  try {
    await db.insert(activityLog).values({
      source,
      label: label.slice(0, 80),
      outcome,
      detail: detail.slice(0, 200),
      createdAt: Date.now(),
    });
    const count = await db.$count(activityLog);
    if (count > ACTIVITY_CAP + 50) {
      const cutoffRows = await db
        .select({ id: activityLog.id })
        .from(activityLog)
        .orderBy(desc(activityLog.createdAt))
        .limit(1)
        .offset(ACTIVITY_CAP);
      if (cutoffRows[0]) {
        await db.delete(activityLog).where(lt(activityLog.id, cutoffRows[0].id));
      }
    }
  } catch {
    /* logging must never break the pipeline */
  }
}

export async function getRecentActivity(limit = 100): Promise<ActivityEntry[]> {
  const rows = await db
    .select()
    .from(activityLog)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
  return rows as ActivityEntry[];
}

// ── Outbox (offline retry for Google Tasks creation) ─────────────────────────

export interface OutboxRow {
  id: number;
  title: string;
  notes: string | null;
  dueDate: number | null;
  createdAt: number;
  attempts: number;
}

export async function enqueueOutbox(
  title: string,
  notes: string | null,
  dueDate: number | null
): Promise<void> {
  await db.insert(outbox).values({ title, notes, dueDate, createdAt: Date.now() });
}

export async function getOutbox(limit = 25): Promise<OutboxRow[]> {
  const rows = await db.select().from(outbox).orderBy(outbox.createdAt).limit(limit);
  return rows as OutboxRow[];
}

export async function removeOutboxRow(id: number): Promise<void> {
  await db.delete(outbox).where(eq(outbox.id, id));
}

export async function bumpOutboxAttempts(id: number): Promise<void> {
  await db
    .update(outbox)
    .set({ attempts: sql`${outbox.attempts} + 1` })
    .where(eq(outbox.id, id));
}
