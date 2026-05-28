import { eq, and, desc, isNull, not, lt, gte, gt } from 'drizzle-orm';
import type { Database } from '../db/client';
import { tasks } from '../db/schema';
import type { Task, Priority, TaskStatus } from '@/domain/types';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface CreateTaskInput {
  title: string;
  body?: string;
  sourceApp: string;
  sender?: string;
  priority: Priority;
  confidence: number;
  ruleScore?: number;
  modelScore?: number;
  language: string;
  matchedKeywords: string[];
  needsConfirmation: boolean;
  dueDate?: number | null;
  screenshotPath?: string | null;
  notificationKey?: string | null;
  createdAt?: number;
}

function mapRow(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    title: row.title,
    body: row.body ?? null,
    sourceApp: row.sourceApp,
    sender: row.sender ?? null,
    priority: row.priority as Priority,
    status: row.status as TaskStatus,
    confidence: row.confidence,
    needsConfirmation: row.needsConfirmation ?? false,
    dueDate: row.dueDate ?? null,
    screenshotPath: row.screenshotPath ?? null,
    createdAt: row.createdAt,
    completedAt: row.completedAt ?? null,
    deletedAt: row.deletedAt ?? null,
  };
}

export class TaskRepository {
  constructor(private readonly db: Database) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    const id = generateId();
    const now = input.createdAt ?? Date.now();
    await this.db.insert(tasks).values({
      id,
      title: input.title,
      body: input.body ?? null,
      sourceApp: input.sourceApp,
      sender: input.sender ?? null,
      priority: input.priority,
      status: 'PENDING',
      confidence: input.confidence,
      ruleScore: input.ruleScore,
      modelScore: input.modelScore ?? null,
      language: input.language,
      matchedKeywords: JSON.stringify(input.matchedKeywords),
      needsConfirmation: input.needsConfirmation,
      dueDate: input.dueDate ?? null,
      screenshotPath: input.screenshotPath ?? null,
      notificationKey: input.notificationKey ?? null,
      createdAt: now,
    });

    const result = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);

    if (!result[0]) throw new Error(`Failed to create task ${id}`);
    return mapRow(result[0]);
  }

  async getTaskById(id: string): Promise<Task | null> {
    const result = await this.db.select().from(tasks).where(eq(tasks.id, id)).limit(1);
    return result[0] ? mapRow(result[0]) : null;
  }

  async getPendingTasks(): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'PENDING'),
          eq(tasks.needsConfirmation, false),
          isNull(tasks.deletedAt)
        )
      )
      .orderBy(desc(tasks.createdAt));
    return rows.map(mapRow);
  }

  async getConfirmationQueue(): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(eq(tasks.status, 'PENDING'), eq(tasks.needsConfirmation, true), isNull(tasks.deletedAt))
      )
      .orderBy(desc(tasks.createdAt));
    return rows.map(mapRow);
  }

  async getCompletedTasks(): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.status, 'COMPLETE'), isNull(tasks.deletedAt)))
      .orderBy(desc(tasks.completedAt));
    return rows.map(mapRow);
  }

  async completeTask(id: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ status: 'COMPLETE', completedAt: Date.now() })
      .where(eq(tasks.id, id));
  }

  async deleteTask(id: string): Promise<void> {
    await this.db
      .update(tasks)
      .set({ status: 'ARCHIVED', deletedAt: Date.now() })
      .where(eq(tasks.id, id));
  }

  async updatePriority(id: string, priority: Priority): Promise<void> {
    await this.db.update(tasks).set({ priority }).where(eq(tasks.id, id));
  }

  async confirmTask(id: string): Promise<void> {
    await this.db.update(tasks).set({ needsConfirmation: false }).where(eq(tasks.id, id));
  }

  async updateTitle(id: string, title: string): Promise<void> {
    await this.db.update(tasks).set({ title }).where(eq(tasks.id, id));
  }

  async setCalendarEvent(id: string, calendarEventId: string): Promise<void> {
    await this.db.update(tasks).set({ calendarEventId }).where(eq(tasks.id, id));
  }

  async purgeOldArchivedTasks(retentionMs = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    const cutoff = Date.now() - retentionMs;
    const result = await this.db
      .delete(tasks)
      .where(and(not(isNull(tasks.deletedAt)), lt(tasks.deletedAt, cutoff)));
    return result.changes ?? 0;
  }

  async getTodayCompletedCount(): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const rows = await this.db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.status, 'COMPLETE'),
          isNull(tasks.deletedAt),
          gte(tasks.completedAt, startOfDay.getTime())
        )
      );
    return rows.length;
  }

  async getRecentBySenderAndApp(
    sender: string,
    sourceApp: string,
    windowMs = 2 * 60 * 60 * 1000
  ): Promise<{ id: string; title: string }[]> {
    const cutoff = Date.now() - windowMs;
    const rows = await this.db
      .select({ id: tasks.id, title: tasks.title })
      .from(tasks)
      .where(
        and(
          eq(tasks.sender, sender),
          eq(tasks.sourceApp, sourceApp),
          isNull(tasks.deletedAt),
          gt(tasks.createdAt, cutoff)
        )
      )
      .orderBy(desc(tasks.createdAt))
      .limit(10);
    return rows as { id: string; title: string }[];
  }

  async findByNotificationKey(notificationKey: string): Promise<Task | null> {
    const result = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.notificationKey, notificationKey), isNull(tasks.deletedAt)))
      .limit(1);
    return result[0] ? mapRow(result[0]) : null;
  }

  async countByStatus(): Promise<Record<string, number>> {
    const rows = await this.db.select().from(tasks).where(isNull(tasks.deletedAt));
    return rows.reduce(
      (acc, row) => {
        acc[row.status] = (acc[row.status] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
  }
}
