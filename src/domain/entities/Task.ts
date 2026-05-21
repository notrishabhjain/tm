import type { Task, Priority, TaskStatus, Language } from '../types';

export function createTaskEntity(params: {
  id: string;
  title: string;
  body: string | null;
  sourceApp: string;
  sender: string | null;
  priority: Priority;
  status: TaskStatus;
  confidence: number;
  needsConfirmation: boolean;
  dueDate: number | null;
  screenshotPath: string | null;
  createdAt: number;
  completedAt: number | null;
  deletedAt: number | null;
}): Task {
  if (!params.title.trim()) throw new Error('Task title cannot be empty');
  if (params.confidence < 0 || params.confidence > 1) throw new Error('Confidence must be 0-1');
  return { ...params };
}

export function isTaskActionable(task: Task): boolean {
  return task.status === 'PENDING' && task.deletedAt === null;
}

export function isPriorityAbove(task: Task, threshold: Priority): boolean {
  const order: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];
  return order.indexOf(task.priority) >= order.indexOf(threshold);
}

export type { Task, Priority, TaskStatus, Language };
