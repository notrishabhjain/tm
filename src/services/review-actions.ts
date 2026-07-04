import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { SenderStatsRepository } from '@/data/repositories/SenderStatsRepository';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { LearnedKeywordRepository } from '@/data/repositories/LearnedKeywordRepository';
import { extractNgrams, languageForText } from './ngram-extractor';
import { buildSenderKey, buildAppKey } from './signal-scorer';
import { createGoogleTask, deleteGoogleTask, buildGoogleTaskNotes } from './google-tasks';
import { getSetting } from '@/data/storage/settings';
import type { Task } from '@/domain/types';

const taskRepo = new TaskRepository(db);
const senderStatsRepo = new SenderStatsRepository(db);
const discardedRepo = new DiscardedLogRepository(db);
const learnedKwRepo = new LearnedKeywordRepository(db);

/**
 * Confirm a Review task: clears needsConfirmation, records positive learning
 * signals (sender + app stats, keyword reinforcement), and syncs to Google
 * Tasks. Shared by the Review tab and the call-review screen.
 */
export async function confirmReviewTask(task: Task): Promise<void> {
  await taskRepo.confirmTask(task.id);
  const senderKey = buildSenderKey(task.sourceApp, task.sender ?? '');
  await senderStatsRepo.incrementConfirm(senderKey);
  await senderStatsRepo.incrementConfirm(buildAppKey(task.sourceApp));
  const text = task.body ?? task.title;
  const ngrams = extractNgrams(text, 'EN');
  if (ngrams.length > 0) {
    try {
      await learnedKwRepo.recordNgrams(ngrams, languageForText('EN'));
    } catch {
      // Non-fatal
    }
  }
  if (getSetting('google_tasks_enabled') && !task.googleTaskId) {
    void createGoogleTask({
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
    })
      .then((googleTaskId) => {
        if (googleTaskId) void taskRepo.setGoogleTaskId(task.id, googleTaskId);
      })
      .catch(() => {
        /* non-fatal — outbox sweep retries */
      });
  }
}

/**
 * Reject a Review task: logs the discard, records negative learning signals
 * (sender + app stats, keyword penalties), and deletes the task.
 */
export async function rejectReviewTask(task: Task): Promise<void> {
  await discardedRepo.insert({
    notificationId: task.id,
    notificationKey: task.notificationKey,
    sourceApp: task.sourceApp,
    sender: task.sender ?? null,
    bodyPreview: task.body ?? task.title,
    reason: 'USER_REJECTED',
    confidence: task.confidence,
    createdAt: Date.now(),
  });
  const senderKey = buildSenderKey(task.sourceApp, task.sender ?? '');
  await senderStatsRepo.incrementReject(senderKey);
  await senderStatsRepo.incrementReject(buildAppKey(task.sourceApp));
  const rejectedText = task.body ?? task.title;
  const rejectedNgrams = extractNgrams(rejectedText, 'EN');
  if (rejectedNgrams.length > 0) {
    try {
      await learnedKwRepo.penalizeNgrams(rejectedNgrams, languageForText('EN'));
    } catch {
      // Non-fatal
    }
  }
  if (task.googleTaskId) {
    void deleteGoogleTask(task.googleTaskId).catch(() => {});
  }
  await taskRepo.deleteTask(task.id);
}
