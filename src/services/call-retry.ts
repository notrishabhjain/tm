import { db } from '@/data/db/client';
import { CallRecordRepository } from '@/data/repositories/CallRecordRepository';
import { logActivity } from '@/data/pipeline-store';
import { getSetting } from '@/data/storage/settings';
import { extractTasksFromTranscript } from './transcript-extractor';
import { intakeCandidates, type TaskCandidate } from './task-intake';
import NotificationListener from '../../modules/notification-listener/src';

const callRecordRepo = new CallRecordRepository(db);

let _running = false;

/**
 * Confidence assigned to a task extracted from a call transcript.
 *
 * A call is far richer context than a single message and the extractor returns
 * explicit structured commitments, so these are trusted enough to auto-create.
 * Kept below 1.0 so a call-derived task stays distinguishable from one the user
 * typed themselves.
 */
const CALL_TASK_CONFIDENCE = 0.85;

/** Below this a transcript cannot plausibly contain a commitment. */
const MIN_TRANSCRIPT_CHARS = 30;

/**
 * Turns transcribed-but-not-yet-extracted calls into tasks IN THIS APP.
 *
 * Runs on app launch, on foreground, and after the native call pipeline stores
 * a fresh transcript. The transcript is already persisted by the time this
 * runs, so a failure here costs only the extraction step and is retried on the
 * next pass — the call itself is never lost.
 */
export async function retryFailedCallAnalyses(): Promise<void> {
  if (_running) return;
  _running = true;
  try {
    const pending = await callRecordRepo.getPendingAnalysis();
    for (const record of pending) {
      // A fragment is not worth an extraction round-trip, and extractors
      // hallucinate commitments out of noise.
      if (!record.transcript || record.transcript.trim().length < MIN_TRANSCRIPT_CHARS) {
        await callRecordRepo.markExtracted(record.id, '', []);
        await logActivity(
          'call',
          record.callerLabel,
          'SKIPPED',
          'Transcript too short to contain a task'
        ).catch(() => {});
        continue;
      }

      const extracted = await extractTasksFromTranscript(record.transcript, {
        referenceTime: record.callTime,
        callerLabel: record.callerLabel,
      });

      // null means the extractor itself failed (no key, network, bad response).
      // Leave the record TRANSCRIBED so the next pass retries, rather than
      // marking a call handled with nothing to show for it.
      if (extracted === null) {
        await logActivity(
          'call',
          record.callerLabel,
          'ERROR',
          'Task extraction unavailable — transcript kept, will retry'
        ).catch(() => {});
        continue;
      }

      // Mark extracted BEFORE intake: a crash mid-intake must not loop this
      // record forever, and intake deduplicates, so a repeat pass is harmless.
      await callRecordRepo.markExtracted(record.id, '', []);

      if (extracted.length === 0) {
        await logActivity(
          'call',
          record.callerLabel,
          'SKIPPED',
          'No action items in this call'
        ).catch(() => {});
        continue;
      }

      const candidates: TaskCandidate[] = extracted.map((t) => ({
        title: t.title,
        notes: t.notes ?? null,
        dueDate: t.dueDate,
        priority: t.priority,
        confidence: CALL_TASK_CONFIDENCE,
        reasoning: `Extracted from call with ${record.callerLabel}`,
        sourceType: 'CALL',
        // The call record id: every task from one call dedups as a set and
        // stays traceable back to the transcript that produced it.
        sourceRef: record.id,
        sourceLabel: record.callerLabel,
        sourceApp: 'call',
        sourceText: record.transcript.slice(0, 1000),
        inferenceOrigin: getSetting('cloud_fallback_enabled') ? 'CLOUD' : 'LOCAL_LLM',
      }));

      const summary = await intakeCandidates(candidates);

      await logActivity(
        'call',
        record.callerLabel,
        summary.created > 0 ? 'TASK_CREATED' : summary.review > 0 ? 'REVIEW' : 'SKIPPED',
        summary.created > 0
          ? `${summary.created} task(s) from call`
          : summary.review > 0
            ? `${summary.review} item(s) need review`
            : 'No new tasks from call'
      ).catch(() => {});

      if (summary.created > 0) {
        void NotificationListener.postConfirmation(
          `Call with ${record.callerLabel}`,
          `${summary.created} task${summary.created !== 1 ? 's' : ''} added`
        ).catch(() => {});
      }
    }
  } catch {
    /* next foreground retries */
  } finally {
    _running = false;
  }
}
