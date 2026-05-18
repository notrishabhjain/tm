import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { monitoredApps } from '../db/schema';
import type { MonitoredApp } from '@/domain/types';

function mapRow(row: typeof monitoredApps.$inferSelect): MonitoredApp {
  return {
    id: String(row.id),
    packageName: row.packageName,
    displayName: row.displayName,
    isActive: Boolean(row.isActive),
    createdAt: row.createdAt,
  };
}

export class MonitoredAppRepository {
  constructor(private readonly db: Database) {}

  async getAll(): Promise<MonitoredApp[]> {
    const rows = await this.db.select().from(monitoredApps);
    return rows.map(mapRow);
  }

  async getActive(): Promise<MonitoredApp[]> {
    const rows = await this.db.select().from(monitoredApps).where(eq(monitoredApps.isActive, true));
    return rows.map(mapRow);
  }

  async getActivePackageNames(): Promise<string[]> {
    const rows = await this.db
      .select({ packageName: monitoredApps.packageName })
      .from(monitoredApps)
      .where(eq(monitoredApps.isActive, true));
    return rows.map((r) => r.packageName);
  }

  async upsert(packageName: string, displayName: string): Promise<void> {
    const existing = await this.db
      .select()
      .from(monitoredApps)
      .where(eq(monitoredApps.packageName, packageName))
      .limit(1);

    if (existing.length === 0) {
      await this.db.insert(monitoredApps).values({
        packageName,
        displayName,
        isActive: true,
        createdAt: Date.now(),
      });
    }
  }

  async setActive(packageName: string, isActive: boolean): Promise<void> {
    await this.db
      .update(monitoredApps)
      .set({ isActive })
      .where(eq(monitoredApps.packageName, packageName));
  }
}
