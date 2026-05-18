/**
 * Core task entity. Represents a single captured and extracted task.
 * @module domain/entities/Task
 */

export const Priority = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;
export type Priority = (typeof Priority)[keyof typeof Priority];

export const TaskStatus = {
  PENDING: 'PENDING',
  AWAITING_CONFIRMATION: 'AWAITING_CONFIRMATION',
  COMPLETED: 'COMPLETED',
  DELETED: 'DELETED',
} as const;
export type TaskStatus = (typeof TaskStatus)[keyof typeof TaskStatus];

export const Language = {
  EN: 'en',
  HI: 'hi',
  HI_EN: 'hi-en',
} as const;
export type Language = (typeof Language)[keyof typeof Language];

/** A fully persisted task record (as returned from the DB). */
export interface Task {
  id: string;
  text: string;
  rawSourceText: string;
  priority: Priority;
  status: TaskStatus;
  sourceApp: string;
  sourceAppDisplay: string;
  sender: string | null;
  createdAt: number; // epoch ms
  completedAt: number | null;
  deletedAt: number | null;
  dueAt: number | null;
  triggerKeywords: string[]; // stored as JSON in DB
  confidence: number; // [0.0, 1.0]
  ruleScore: number;
  modelScore: number | null;
  needsConfirmation: boolean;
  calendarEventId: string | null;
  language: Language;
}

/** Input shape for creating a new task. */
export interface CreateTaskInput {
  text: string;
  rawSourceText: string;
  priority: Priority;
  sourceApp: string;
  sourceAppDisplay: string;
  sender: string | null;
  triggerKeywords: string[];
  confidence: number;
  ruleScore: number;
  modelScore: number | null;
  needsConfirmation: boolean;
  language: Language;
  dueAt?: number | null;
}

/** Patch shape for updating an existing task. */
export type UpdateTaskInput = Partial<
  Pick<Task, 'text' | 'priority' | 'dueAt' | 'calendarEventId' | 'needsConfirmation'>
>;
