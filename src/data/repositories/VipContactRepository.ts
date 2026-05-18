import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { vipContacts } from '../db/schema';
import type { VipContact } from '@/domain/types';

function mapRow(row: typeof vipContacts.$inferSelect): VipContact {
  return {
    id: String(row.id),
    identifier: row.identifier,
    displayName: row.displayName,
    sourceApp: row.sourceApp,
    createdAt: row.createdAt,
  };
}

export class VipContactRepository {
  constructor(private readonly db: Database) {}

  async getAll(): Promise<VipContact[]> {
    const rows = await this.db.select().from(vipContacts);
    return rows.map(mapRow);
  }

  async add(identifier: string, displayName: string, sourceApp = '*'): Promise<VipContact> {
    const now = Date.now();
    const result = await this.db
      .insert(vipContacts)
      .values({ identifier, displayName, sourceApp, createdAt: now })
      .returning();
    if (!result[0]) throw new Error('Failed to add VIP contact');
    return mapRow(result[0]);
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(vipContacts).where(eq(vipContacts.id, id));
  }

  async isVip(name: string): Promise<boolean> {
    const rows = await this.db.select().from(vipContacts);
    const nameLower = name.toLowerCase();
    return rows.some((r) => nameLower.includes(r.identifier.toLowerCase()));
  }

  async getAllIdentifiers(): Promise<string[]> {
    const rows = await this.db.select({ identifier: vipContacts.identifier }).from(vipContacts);
    return rows.map((r) => r.identifier);
  }
}
