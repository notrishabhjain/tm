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

  async incrementConfirm(senderKey: string): Promise<void> {
    const now = Date.now();
    await this.db
      .insert(senderStats)
      .values({ senderKey, confirmCount: 1, rejectCount: 0, autoAcceptCount: 0, lastSeenAt: now })
      .onConflictDoUpdate({
        target: senderStats.senderKey,
        set: { confirmCount: sql`${senderStats.confirmCount} + 1`, lastSeenAt: now },
      });
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
