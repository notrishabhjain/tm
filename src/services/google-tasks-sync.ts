import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { createGoogleTask, buildGoogleTaskNotes } from './google-tasks';
import { getSetting } from '@/data/storage/settings';

// Prevents overlapping sweeps when foreground events fire in quick succession.
let _syncing = false;
let _lastSweepAt = 0;
const MIN_SWEEP_INTERVAL_MS = 60_000;

/**
 * Sync outbox sweep: pushes every confirmed task that has no googleTaskId to
 * Google Tasks. Catches syncs that were lost when the background (headless)
 * JS context was killed mid-fetch, or that failed transiently.
 *
 * Called on app foreground and after notification processing. Cheap when
 * there's nothing to do (single indexed query).
 */
export async function syncPendingGoogleTasks(force = false): Promise<number> {
  if (!getSetting('google_tasks_enabled')) return 0;
  if (_syncing) return 0;
  if (!force && Date.now() - _lastSweepAt < MIN_SWEEP_INTERVAL_MS) return 0;

  _syncing = true;
  _lastSweepAt = Date.now();
  let synced = 0;
  try {
    const taskRepo = new TaskRepository(db);
    const unsynced = await taskRepo.getUnsyncedForGoogle();
    for (const task of unsynced) {
      const googleTaskId = await createGoogleTask({
        title: task.title,
        notes: buildGoogleTaskNotes({
          priority: task.priority,
          sender: task.sender,
          sourceApp: task.sourceApp,
          howTo: task.howTo,
          estimatedMinutes: task.estimatedMinutes,
          dueDate: task.dueDate,
          body: task.body,
        }),
        dueDate: task.dueDate,
      });
      if (googleTaskId) {
        await taskRepo.setGoogleTaskId(task.id, googleTaskId);
        synced++;
      } else {
        // Token refresh failed or network down — stop the sweep; the next
        // foreground event retries. Continuing would just fail N more times.
        break;
      }
    }
  } catch {
    /* non-fatal — next sweep retries */
  } finally {
    _syncing = false;
  }
  return synced;
}
