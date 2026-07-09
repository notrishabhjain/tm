import { db } from '@/data/db/client';
import { CallRecordRepository } from '@/data/repositories/CallRecordRepository';
import { logActivity, enqueueOutbox } from '@/data/pipeline-store';
import { extractTasksFromTranscript } from './transcript-extractor';
import { createGoogleTask, buildGoogleTaskNotes } from './google-tasks';
import NotificationListener from '../../modules/notification-listener/src';

const callRecordRepo = new CallRecordRepository(db);

let _running = false;

/**
 * Retries calls whose background LLM analysis failed (network hiccup, rate
 * limit). Runs on app launch/foreground — the transcript was preserved, only
 * the extraction step is repeated. Successful tasks go straight to Google.
 */
export async function retryFailedCallAnalyses(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const pending = await callRecordRepo.getPendingAnalysis();
    for (const record of pending) {
      const extracted = await extractTasksFromTranscript(record.transcript, {
        referenceTime: record.callTime,
        callerLabel: record.callerLabel,
      });
      if (extracted === null) continue; // still failing — retry on next open

      await callRecordRepo.markExtracted(record.id, '', []);

      let created = 0;
      for (const t of extracted) {
        const notes = buildGoogleTaskNotes({
          priority: t.priority,
          sender: record.callerLabel,
          sourceApp: 'call.transcript',
          dueDate: t.dueDate,
          body: t.notes ?? undefined,
        });
        const googleTaskId = await createGoogleTask({
          title: t.title,
          notes,
          dueDate: t.dueDate,
        });
        if (googleTaskId) {
          created++;
        } else {
          await enqueueOutbox(t.title, notes, t.dueDate);
        }
      }

      await logActivity(
        'call',
        record.callerLabel,
        extracted.length === 0 ? 'SKIPPED' : 'TASK_CREATED',
        extracted.length === 0
          ? 'No action items in this call (retry)'
          : `${extracted.length} task(s) from call (retry)`
      );
      if (created > 0) {
        void NotificationListener.postConfirmation(
          `Call with ${record.callerLabel}`,
          `${created} task${created !== 1 ? 's' : ''} → Google Tasks`
        ).catch(() => {});
      }
    }
  } catch {
    /* next foreground retries */
  } finally {
    _running = false;
  }
}
