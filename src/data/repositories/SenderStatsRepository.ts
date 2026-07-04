import { eq, sql } from 'drizzle-orm';
import type { Database } from '../db/client';
import { senderStats } from '../db/schema';
import type { SenderStats } from '@/domain/types';

function mapRow(row: typeof senderStats.$inferSelect): SenderStats {
  return {
    id: String(row.id),
    senderKey: row.senderKey,
    confirmCount: row.confirmCount,
    rejectCount: row.rejectCount,
    autoAcceptCount: row.autoAcceptCount,
    lastSeenAt: row.lastSeenAt,
    tier: row.tier,
    seedTrust: row.seedTrust ?? null,
  };
}

// Mirrors deriveTier in signal-scorer.ts — keeps the persisted tier in sync with
// the effective tier the scorer computes, so analytics and future reads see the
// learned state rather than a permanently-stale 'UNKNOWN'.
function computeTier(
  stored: string,
  confirmCount: number,
  rejectCount: number,
  autoAcceptCount: number,
  seedTrust: number | null
): string {
  if (stored === 'VIP_PERSONAL') return 'VIP_PERSONAL';
  const interactions = confirmCount + rejectCount + autoAcceptCount;
  const computedTrust = confirmCount / (confirmCount + rejectCount + 1);
  const trust = seedTrust != null && interactions < 10 ? seedTrust : computedTrust;
  if (stored === 'VIP_WORK' || trust >= 0.8) return 'VIP_WORK';
  if (stored === 'UNKNOWN' && interactions < 3) return 'UNKNOWN';
  if (trust >= 0.5) return 'WORK';
  if (trust > 0) return 'INFO';
  return 'UNKNOWN';
}

export class SenderStatsRepository {
  constructor(private readonly db: Database) {}

  async get(senderKey: string): Promise<SenderStats | null> {
    const rows = await this.db
      .select()
      .from(senderStats)
      .where(eq(senderStats.senderKey, senderKey))
      .limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  // Recompute and persist the tier from the current counters. Called after
  // every counter change so the engine keeps learning instead of staying static.
  private async refreshTier(senderKey: string): Promise<void> {
    try {
      const stats = await this.get(senderKey);
      if (!stats) return;
      const newTier = computeTier(
        stats.tier,
        stats.confirmCount,
        stats.rejectCount,
        stats.autoAcceptCount,
        stats.seedTrust
      );
      if (newTier !== stats.tier) {
        await this.db
          .update(senderStats)
          .set({ tier: newTier })
          .where(eq(senderStats.senderKey, senderKey));
      }
    } catch {
      /* non-fatal — tier refresh is best-effort */
    }
  }

  async incrementConfirm(senderKey: string): Promise<void> {
    const now = Date.now();
    await this.db
      .insert(senderStats)
      .values({ senderKey, confirmCount: 1, rejectCount: 0, autoAcceptCount: 0, lastSeenAt: now })
      .onConflictDoUpdate({
        target: senderStats.senderKey,
        set: { confirmCount: sql`${senderStats.confirmCount} + 1`, lastSeenAt: now },
      });
    await this.refreshTier(senderKey);
  }

  async incrementReject(senderKey: string): Promise<void> {
    const now = Date.now();
    await this.db
      .insert(senderStats)
      .values({ senderKey, confirmCount: 0, rejectCount: 1, autoAcceptCount: 0, lastSeenAt: now })
      .onConflictDoUpdate({
        target: senderStats.senderKey,
        set: { rejectCount: sql`${senderStats.rejectCount} + 1`, lastSeenAt: now },
      });
    await this.refreshTier(senderKey);
  }

  async incrementAutoAccept(senderKey: string): Promise<void> {
    const now = Date.now();
    await this.db
      .insert(senderStats)
      .values({ senderKey, confirmCount: 0, rejectCount: 0, autoAcceptCount: 1, lastSeenAt: now })
      .onConflictDoUpdate({
        target: senderStats.senderKey,
        set: { autoAcceptCount: sql`${senderStats.autoAcceptCount} + 1`, lastSeenAt: now },
      });
    await this.refreshTier(senderKey);
  }

  async getConfidenceAdjustment(senderKey: string): Promise<number> {
    const stats = await this.get(senderKey);
    if (!stats) return 0;

    const total = stats.confirmCount + stats.rejectCount;
    if (total < 5) return 0; // Not enough data

    const confirmRate = stats.confirmCount / total;
    // Positive adjustment if sender is usually confirmed, negative if usually rejected
    return (confirmRate - 0.5) * 0.2;
  }
}
