import { desc, asc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { discardedLog } from '../db/schema';
import type { DiscardedLogEntry, DiscardReason } from '@/domain/types';

const MAX_ENTRIES = 500;

function mapRow(row: typeof discardedLog.$inferSelect): DiscardedLogEntry {
  return {
    id: String(row.id),
    notificationId: row.notificationId,
    notificationKey: row.notificationKey ?? null,
    sourceApp: row.sourceApp,
    sender: row.sender ?? null,
    bodyPreview: row.bodyPreview,
    reason: row.reason as DiscardReason,
    confidence: row.confidence,
    createdAt: row.createdAt,
  };
}

export class DiscardedLogRepository {
  constructor(private readonly db: Database) {}

  async insert(entry: Omit<DiscardedLogEntry, 'id'>): Promise<void> {
    await this.db.insert(discardedLog).values({
      notificationId: entry.notificationId,
      notificationKey: entry.notificationKey ?? null,
      sourceApp: entry.sourceApp,
      sender: entry.sender ?? null,
      bodyPreview: entry.bodyPreview.slice(0, 300),
      reason: entry.reason,
      confidence: entry.confidence,
      createdAt: entry.createdAt,
    });

    // Enforce rolling cap of 500 entries
    const count = await this.db.$count(discardedLog);
    if (count > MAX_ENTRIES) {
      const oldest = await this.db
        .select({ id: discardedLog.id })
        .from(discardedLog)
        .orderBy(asc(discardedLog.createdAt))
        .limit(count - MAX_ENTRIES);
      for (const row of oldest) {
        await this.db.delete(discardedLog).where(eq(discardedLog.id, row.id));
      }
    }
  }

  async getAll(limit = 500): Promise<DiscardedLogEntry[]> {
    const rows = await this.db
      .select()
      .from(discardedLog)
      .orderBy(desc(discardedLog.createdAt))
      .limit(limit);
    return rows.map(mapRow);
  }

  async deleteById(id: number): Promise<void> {
    await this.db.delete(discardedLog).where(eq(discardedLog.id, id));
  }

  async existsByNotificationKey(notificationKey: string): Promise<boolean> {
    const result = await this.db
      .select({ id: discardedLog.id })
      .from(discardedLog)
      .where(eq(discardedLog.notificationKey, notificationKey))
      .limit(1);
    return result.length > 0;
  }

  async count(): Promise<number> {
    return this.db.$count(discardedLog);
  }
}
