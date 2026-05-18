import { eq } from 'drizzle-orm';
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

  private async getOrCreate(senderKey: string): Promise<typeof senderStats.$inferSelect> {
    const existing = await this.db
      .select()
      .from(senderStats)
      .where(eq(senderStats.senderKey, senderKey))
      .limit(1);

    if (existing[0]) return existing[0];

    const result = await this.db
      .insert(senderStats)
      .values({
        senderKey,
        confirmCount: 0,
        rejectCount: 0,
        autoAcceptCount: 0,
        lastSeenAt: Date.now(),
      })
      .returning();
    if (!result[0]) throw new Error(`Failed to create sender stats for ${senderKey}`);
    return result[0];
  }

  async incrementConfirm(senderKey: string): Promise<void> {
    const row = await this.getOrCreate(senderKey);
    await this.db
      .update(senderStats)
      .set({ confirmCount: row.confirmCount + 1, lastSeenAt: Date.now() })
      .where(eq(senderStats.senderKey, senderKey));
  }

  async incrementReject(senderKey: string): Promise<void> {
    const row = await this.getOrCreate(senderKey);
    await this.db
      .update(senderStats)
      .set({ rejectCount: row.rejectCount + 1, lastSeenAt: Date.now() })
      .where(eq(senderStats.senderKey, senderKey));
  }

  async incrementAutoAccept(senderKey: string): Promise<void> {
    const row = await this.getOrCreate(senderKey);
    await this.db
      .update(senderStats)
      .set({ autoAcceptCount: row.autoAcceptCount + 1, lastSeenAt: Date.now() })
      .where(eq(senderStats.senderKey, senderKey));
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
