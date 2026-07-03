import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { completeGoogleTask } from './google-tasks';
import NotificationListener from '../../modules/notification-listener/src';

const taskRepo = new TaskRepository(db);

/**
 * Single entry point for completing a task from ANY surface (list swipe,
 * detail screen, quick action, auto-completion). Keeps the local DB, Google
 * Tasks, and the home-screen widget in sync — previously only the detail
 * screen propagated completion to Google, so swipe-completed tasks stayed
 * open in Google Tasks forever.
 */
export async function completeTaskEverywhere(id: string): Promise<void> {
  const task = await taskRepo.getTaskById(id);
  await taskRepo.completeTask(id);
  if (task?.googleTaskId) {
    void completeGoogleTask(task.googleTaskId).catch(() => {});
  }
  void NotificationListener.updateWidget().catch(() => {});
}

/** Delete counterpart — refreshes the widget after removal. */
export async function deleteTaskEverywhere(id: string): Promise<void> {
  await taskRepo.deleteTask(id);
  void NotificationListener.updateWidget().catch(() => {});
}

/** Fire-and-forget widget refresh for flows that mutate tasks in other ways. */
export function refreshWidget(): void {
  void NotificationListener.updateWidget().catch(() => {});
}
