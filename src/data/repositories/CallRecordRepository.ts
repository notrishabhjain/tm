import { desc, eq, inArray } from 'drizzle-orm';
import type { Database } from '../db/client';
import { callRecords, tasks } from '../db/schema';
import type { Task } from '@/domain/types';

export interface CallRecord {
  id: string;
  callerLabel: string;
  callerNumber: string | null;
  callTime: number;
  durationSec: number | null;
  transcript: string;
  summary: string | null;
  topics: string[];
  taskIds: string[];
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
    taskIds: parseJsonArray(row.taskIds),
    status: row.status as CallRecord['status'],
    createdAt: row.createdAt,
  };
}

export class CallRecordRepository {
  constructor(private readonly db: Database) {}

  async getById(id: string): Promise<CallRecord | null> {
    const rows = await this.db.select().from(callRecords).where(eq(callRecords.id, id)).limit(1);
    return rows[0] ? mapRow(rows[0]) : null;
  }

  async getRecent(limit = 50): Promise<CallRecord[]> {
    const rows = await this.db
      .select()
      .from(callRecords)
      .orderBy(desc(callRecords.createdAt))
      .limit(limit);
    return rows.map(mapRow);
  }

  async markReviewed(id: string): Promise<void> {
    await this.db.update(callRecords).set({ status: 'REVIEWED' }).where(eq(callRecords.id, id));
  }

  /** The tasks the native pipeline created for this call, newest first. */
  async getTasksForRecord(record: CallRecord): Promise<Task[]> {
    if (record.taskIds.length === 0) return [];
    const rows = await this.db.select().from(tasks).where(inArray(tasks.id, record.taskIds));
    // Reuse the row shape mapping inline — TaskRepository.mapRow is private.
    return rows.map((row: typeof tasks.$inferSelect) => ({
      id: row.id,
      title: row.title,
      body: row.body ?? null,
      sourceApp: row.sourceApp,
      sender: row.sender ?? null,
      priority: row.priority as Task['priority'],
      status: row.status as Task['status'],
      confidence: row.confidence,
      needsConfirmation: row.needsConfirmation ?? false,
      dueDate: row.dueDate ?? null,
      screenshotPath: row.screenshotPath ?? null,
      notificationKey: row.notificationKey ?? null,
      googleTaskId: row.googleTaskId ?? null,
      howTo: row.howTo ?? null,
      estimatedMinutes: row.estimatedMinutes ?? null,
      createdAt: row.createdAt,
      completedAt: row.completedAt ?? null,
      deletedAt: row.deletedAt ?? null,
    }));
  }
}
