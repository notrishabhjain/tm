import { and, desc, eq, gte, isNull, lt, or, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { tasks, reviewItems } from '../db/schema';

export type TaskPriority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
export type TaskStatus = 'ACTIVE' | 'COMPLETED' | 'DELETED';
export type TaskSourceType = 'NOTIFICATION' | 'CALL' | 'MANUAL';
export type SyncState = 'LOCAL_ONLY' | 'PENDING' | 'SYNCED' | 'FAILED';
export type ReviewState = 'PENDING' | 'ACCEPTED' | 'DISMISSED' | 'EXPIRED';

export interface Task {
  id: string;
  title: string;
  notes: string | null;
  dueAt: number | null;
  priority: TaskPriority;
  status: TaskStatus;
  sourceType: TaskSourceType;
  sourceRef: string | null;
  sourceLabel: string | null;
  sourceApp: string | null;
  confidence: number | null;
  inferenceOrigin: string | null;
  remoteId: string | null;
  syncState: SyncState;
  completedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface ReviewItem {
  id: string;
  title: string;
  notes: string | null;
  dueAt: number | null;
  priority: TaskPriority;
  sourceType: TaskSourceType;
  sourceRef: string | null;
  sourceLabel: string | null;
  sourceApp: string | null;
  sourceText: string | null;
  reasoning: string | null;
  confidence: number | null;
  inferenceOrigin: string | null;
  state: ReviewState;
  createdAt: number;
}

/** Rows written natively (or by an older build) may carry unexpected values. */
function asPriority(v: unknown): TaskPriority {
  return v === 'URGENT' || v === 'HIGH' || v === 'LOW' ? v : 'MEDIUM';
}
function asStatus(v: unknown): TaskStatus {
  return v === 'COMPLETED' || v === 'DELETED' ? v : 'ACTIVE';
}
function asSourceType(v: unknown): TaskSourceType {
  return v === 'CALL' || v === 'MANUAL' ? v : 'NOTIFICATION';
}
function asSyncState(v: unknown): SyncState {
  return v === 'PENDING' || v === 'SYNCED' || v === 'FAILED' ? v : 'LOCAL_ONLY';
}
function asReviewState(v: unknown): ReviewState {
  return v === 'ACCEPTED' || v === 'DISMISSED' || v === 'EXPIRED' ? v : 'PENDING';
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */
function mapTask(row: any): Task {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    notes: row.notes ?? null,
    dueAt: asNumber(row.dueAt),
    priority: asPriority(row.priority),
    status: asStatus(row.status),
    sourceType: asSourceType(row.sourceType),
    sourceRef: row.sourceRef ?? null,
    sourceLabel: row.sourceLabel ?? null,
    sourceApp: row.sourceApp ?? null,
    confidence: asNumber(row.confidence),
    inferenceOrigin: row.inferenceOrigin ?? null,
    remoteId: row.remoteId ?? null,
    syncState: asSyncState(row.syncState),
    completedAt: asNumber(row.completedAt),
    createdAt: asNumber(row.createdAt) ?? 0,
    updatedAt: asNumber(row.updatedAt) ?? 0,
  };
}

function mapReview(row: any): ReviewItem {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    notes: row.notes ?? null,
    dueAt: asNumber(row.dueAt),
    priority: asPriority(row.priority),
    sourceType: asSourceType(row.sourceType),
    sourceRef: row.sourceRef ?? null,
    sourceLabel: row.sourceLabel ?? null,
    sourceApp: row.sourceApp ?? null,
    sourceText: row.sourceText ?? null,
    reasoning: row.reasoning ?? null,
    confidence: asNumber(row.confidence),
    inferenceOrigin: row.inferenceOrigin ?? null,
    state: asReviewState(row.state),
    createdAt: asNumber(row.createdAt) ?? 0,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

export type TaskFilter = 'TODAY' | 'UPCOMING' | 'OVERDUE' | 'COMPLETED' | 'ALL';

/** Local end-of-day for [ts], as an epoch-ms boundary. */
function endOfLocalDay(ts: number): number {
  const d = new Date(ts);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export class TaskRepository {
  constructor(private readonly db: Database) {}

  // ── Reads ──────────────────────────────────────────────────────────────────

  async list(filter: TaskFilter = 'ALL', limit = 200): Promise<Task[]> {
    const now = Date.now();
    const todayEnd = endOfLocalDay(now);

    // Undated tasks belong in Today rather than nowhere — an extraction that
    // produced no date is still something the user has to act on, and a task
    // no filter shows is a task that silently does not exist.
    const where =
      filter === 'COMPLETED'
        ? eq(tasks.status, 'COMPLETED')
        : filter === 'TODAY'
          ? and(eq(tasks.status, 'ACTIVE'), or(isNull(tasks.dueAt), lt(tasks.dueAt, todayEnd + 1)))
          : filter === 'UPCOMING'
            ? and(eq(tasks.status, 'ACTIVE'), gte(tasks.dueAt, todayEnd + 1))
            : filter === 'OVERDUE'
              ? and(eq(tasks.status, 'ACTIVE'), lt(tasks.dueAt, now))
              : eq(tasks.status, 'ACTIVE');

    const rows = await this.db
      .select()
      .from(tasks)
      .where(where)
      // NULL due dates sort last within a filter, then most urgent, then newest.
      .orderBy(
        sql`CASE WHEN ${tasks.dueAt} IS NULL THEN 1 ELSE 0 END`,
        tasks.dueAt,
        sql`CASE ${tasks.priority}
              WHEN 'URGENT' THEN 0 WHEN 'HIGH' THEN 1
              WHEN 'MEDIUM' THEN 2 ELSE 3 END`,
        desc(tasks.createdAt)
      )
      .limit(limit);
    return rows.map(mapTask);
  }

  async counts(): Promise<{ today: number; overdue: number; review: number }> {
    const [today, overdue, review] = await Promise.all([
      this.list('TODAY', 500),
      this.list('OVERDUE', 500),
      this.listReview(500),
    ]);
    return { today: today.length, overdue: overdue.length, review: review.length };
  }

  async getById(id: string): Promise<Task | null> {
    const rows = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return rows.length > 0 ? mapTask(rows[0]) : null;
  }

  /** Tasks awaiting a push to Google Tasks. Only meaningful when sync is on. */
  async listPendingSync(limit = 25): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.syncState, 'PENDING'), eq(tasks.status, 'ACTIVE')))
      .orderBy(tasks.createdAt)
      .limit(limit);
    return rows.map(mapTask);
  }

  async listReview(limit = 100): Promise<ReviewItem[]> {
    const rows = await this.db
      .select()
      .from(reviewItems)
      .where(eq(reviewItems.state, 'PENDING'))
      .orderBy(desc(reviewItems.createdAt))
      .limit(limit);
    return rows.map(mapReview);
  }

  async getReviewById(id: string): Promise<ReviewItem | null> {
    const rows = await this.db.select().from(reviewItems).where(eq(reviewItems.id, id)).limit(1);
    return rows.length > 0 ? mapReview(rows[0]) : null;
  }

  // ── Writes ─────────────────────────────────────────────────────────────────

  /**
   * Inserts a task, ignoring the row if it collides with the dedup index.
   * Returns true only when a row was actually created, so callers can count
   * real creations rather than attempts.
   */
  async insert(row: typeof tasks.$inferInsert): Promise<boolean> {
    const existing = await this.db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.sourceType, row.sourceType),
          row.sourceRef == null ? isNull(tasks.sourceRef) : eq(tasks.sourceRef, row.sourceRef),
          eq(tasks.titleKey, row.titleKey)
        )
      )
      .limit(1);
    // A NULL sourceRef never dedups (manual tasks may legitimately repeat).
    if (row.sourceRef != null && existing.length > 0) return false;

    await this.db.insert(tasks).values(row).onConflictDoNothing();
    return true;
  }

  async insertReview(row: typeof reviewItems.$inferInsert): Promise<boolean> {
    await this.db.insert(reviewItems).values(row).onConflictDoNothing();
    return true;
  }

  async setStatus(id: string, status: TaskStatus): Promise<void> {
    const now = Date.now();
    await this.db
      .update(tasks)
      .set({
        status,
        completedAt: status === 'COMPLETED' ? now : null,
        updatedAt: now,
      })
      .where(eq(tasks.id, id));
  }

  async update(
    id: string,
    patch: Partial<Pick<Task, 'title' | 'notes' | 'dueAt' | 'priority'>>
  ): Promise<void> {
    await this.db
      .update(tasks)
      .set({ ...patch, updatedAt: Date.now() })
      .where(eq(tasks.id, id));
  }

  async markSynced(id: string, remoteId: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ remoteId, syncState: 'SYNCED', updatedAt: Date.now() })
      .where(eq(tasks.id, id));
  }

  async markSyncFailed(id: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ syncState: 'FAILED', updatedAt: Date.now() })
      .where(eq(tasks.id, id));
  }

  async resolveReview(id: string, state: Exclude<ReviewState, 'PENDING'>): Promise<void> {
    await this.db
      .update(reviewItems)
      .set({ state, resolvedAt: Date.now() })
      .where(and(eq(reviewItems.id, id), eq(reviewItems.state, 'PENDING')));
  }

  /**
   * Expires review items older than [maxAgeMs]. Expiry is recorded rather than
   * deleted so the activity trail can still explain where an item went.
   */
  async expireStaleReviews(maxAgeMs: number): Promise<number> {
    const cutoff = Date.now() - maxAgeMs;
    const stale = await this.db
      .select({ id: reviewItems.id })
      .from(reviewItems)
      .where(and(eq(reviewItems.state, 'PENDING'), lt(reviewItems.createdAt, cutoff)));
    if (stale.length === 0) return 0;
    await this.db
      .update(reviewItems)
      .set({ state: 'EXPIRED', resolvedAt: Date.now() })
      .where(and(eq(reviewItems.state, 'PENDING'), lt(reviewItems.createdAt, cutoff)));
    return stale.length;
  }
}
