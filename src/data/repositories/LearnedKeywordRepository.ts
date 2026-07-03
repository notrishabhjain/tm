import { eq, and, desc } from 'drizzle-orm';
import type { Database } from '../db/client';
import { learnedKeywords } from '../db/schema';

export interface LearnedKeyword {
  id: number;
  ngram: string;
  weight: number;
  language: string;
  occurrenceCount: number;
  status: 'PENDING' | 'ACTIVE' | 'DEMOTED';
  createdAt: number;
  updatedAt: number;
}

function mapRow(row: typeof learnedKeywords.$inferSelect): LearnedKeyword {
  return {
    id: row.id,
    ngram: row.ngram,
    weight: row.weight,
    language: row.language,
    occurrenceCount: row.occurrenceCount,
    status: row.status as LearnedKeyword['status'],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

const PROMOTION_THRESHOLD = 3;

export class LearnedKeywordRepository {
  constructor(private readonly db: Database) {}

  async recordNgrams(ngrams: string[], language: string): Promise<void> {
    const now = Date.now();
    for (const ngram of ngrams) {
      const existing = await this.db
        .select()
        .from(learnedKeywords)
        .where(and(eq(learnedKeywords.ngram, ngram), eq(learnedKeywords.language, language)))
        .limit(1);

      if (existing[0]) {
        const newCount = existing[0].occurrenceCount + 1;
        const newStatus =
          existing[0].status === 'DEMOTED'
            ? 'DEMOTED'
            : newCount >= PROMOTION_THRESHOLD
              ? 'ACTIVE'
              : 'PENDING';
        // Positive reinforcement: each confirm nudges weight up (capped at 0.8)
        // so a keyword previously penalised by rejections can recover.
        const newWeight = Math.min(0.8, existing[0].weight + 0.1);
        await this.db
          .update(learnedKeywords)
          .set({ occurrenceCount: newCount, status: newStatus, weight: newWeight, updatedAt: now })
          .where(eq(learnedKeywords.id, existing[0].id));
      } else {
        await this.db.insert(learnedKeywords).values({
          ngram,
          language,
          weight: 0.5,
          occurrenceCount: 1,
          status: 'PENDING',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  /**
   * Negative learning: called when the user REJECTS a task. Each ngram in the
   * rejected message loses weight; once weight goes negative the scorer's
   * learned_keyword_reject branch actively penalises future messages that
   * contain it. Keywords the user has repeatedly confirmed recover quickly
   * because recordNgrams keeps re-promoting them.
   */
  async penalizeNgrams(ngrams: string[], language: string): Promise<void> {
    const now = Date.now();
    for (const ngram of ngrams) {
      const existing = await this.db
        .select()
        .from(learnedKeywords)
        .where(and(eq(learnedKeywords.ngram, ngram), eq(learnedKeywords.language, language)))
        .limit(1);

      if (existing[0]) {
        const newWeight = Math.max(-0.3, existing[0].weight - 0.25);
        // Negative-weight keywords must stay ACTIVE — the scorer only loads
        // ACTIVE rows, and the reject branch triggers on weight < 0.
        const newStatus = newWeight < 0 ? 'ACTIVE' : existing[0].status;
        await this.db
          .update(learnedKeywords)
          .set({ weight: newWeight, status: newStatus, updatedAt: now })
          .where(eq(learnedKeywords.id, existing[0].id));
      } else {
        await this.db.insert(learnedKeywords).values({
          ngram,
          language,
          weight: -0.25,
          occurrenceCount: 1,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        });
      }
    }
  }

  async getAll(): Promise<LearnedKeyword[]> {
    const rows = await this.db
      .select()
      .from(learnedKeywords)
      .orderBy(desc(learnedKeywords.occurrenceCount));
    return rows.map(mapRow);
  }

  async getActive(): Promise<LearnedKeyword[]> {
    const rows = await this.db
      .select()
      .from(learnedKeywords)
      .where(eq(learnedKeywords.status, 'ACTIVE'))
      .orderBy(desc(learnedKeywords.occurrenceCount));
    return rows.map(mapRow);
  }

  async setStatus(id: number, status: LearnedKeyword['status']): Promise<void> {
    await this.db
      .update(learnedKeywords)
      .set({ status, updatedAt: Date.now() })
      .where(eq(learnedKeywords.id, id));
  }

  async remove(id: number): Promise<void> {
    await this.db.delete(learnedKeywords).where(eq(learnedKeywords.id, id));
  }

  async count(): Promise<number> {
    return this.db.$count(learnedKeywords);
  }
}
