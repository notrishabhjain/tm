import { desc, eq, and, gte, or, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { callRecords } from '../db/schema';

export interface CallRecord {
  id: string;
  callerLabel: string;
  callerNumber: string | null;
  callTime: number;
  durationSec: number | null;
  transcript: string;
  summary: string | null;
  topics: string[];
  status: 'TRANSCRIBED' | 'EXTRACTED' | 'REVIEWED';
  createdAt: number;
}

function parseJsonArray(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function mapRow(row: typeof callRecords.$inferSelect): CallRecord {
  return {
    id: row.id,
    callerLabel: row.callerLabel,
    callerNumber: row.callerNumber ?? null,
    callTime: row.callTime,
    durationSec: row.durationSec ?? null,
    transcript: row.transcript,
    summary: row.summary ?? null,
    topics: parseJsonArray(row.topics),
    status: row.status as CallRecord['status'],
    createdAt: row.createdAt,
  };
}

export class CallRecordRepository {
  constructor(private readonly db: Database) {}

  async getRecent(limit = 50): Promise<CallRecord[]> {
    const rows = await this.db
      .select()
      .from(callRecords)
      .orderBy(desc(callRecords.createdAt))
      .limit(limit);
    return rows.map(mapRow);
  }

  /**
   * Calls that have a transcript but no tasks yet (status TRANSCRIBED).
   * Retried on app open, and whenever a transcript is newly attached.
   *
   * Rows with an UNKNOWN duration are included deliberately. `duration >= n` is
   * false for NULL in SQL, so the previous filter silently dropped every call
   * whose length could not be determined — which is the normal case for a
   * transcript produced by the device recorder app, where we have the text but
   * never measured the audio. Those calls would keep their transcript forever
   * and never produce a task. Length is a cost heuristic, not a correctness
   * one, so not knowing it must not mean discarding the call.
   */
  async getPendingAnalysis(minDurationSec = 15): Promise<CallRecord[]> {
    const rows = await this.db
      .select()
      .from(callRecords)
      .where(
        and(
          eq(callRecords.status, 'TRANSCRIBED'),
          or(isNull(callRecords.durationSec), gte(callRecords.durationSec, minDurationSec))
        )
      )
      .orderBy(desc(callRecords.createdAt))
      .limit(5);
    return rows.map(mapRow);
  }

  async markExtracted(id: string, summary: string, topics: string[]): Promise<void> {
    await this.db
      .update(callRecords)
      .set({ status: 'EXTRACTED', summary, topics: JSON.stringify(topics) })
      .where(eq(callRecords.id, id));
  }
}
