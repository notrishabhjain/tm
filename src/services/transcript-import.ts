import { eq } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { logActivity } from '@/data/pipeline-store';
import { parseSpeakerTranscript } from './transcript-format';
import { extractTasksFromTranscript } from './transcript-extractor';
import { intakeCandidates, type TaskCandidate } from './task-intake';
import { callRecords } from '@/data/db/schema';

/**
 * Confidence for a task extracted from a transcript the user imported by hand.
 *
 * Slightly higher than the automatic call path: the user has seen this text and
 * chosen to import it, so the input is known-good even though the extraction
 * still is not.
 */
const IMPORTED_TASK_CONFIDENCE = 0.85;

export interface ImportSummary {
  created: number;
  review: number;
  duplicate: number;
  discarded: number;
  error?: string;
}

function newCallId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Turns an imported transcript into tasks.
 *
 * Stores the transcript as a call record first so the resulting tasks stay
 * traceable to their source, then runs the same extraction and intake path the
 * automatic pipeline uses — one funnel, one set of validation and dedup rules.
 */
export async function importTranscript(input: {
  rawText: string;
  callerLabel: string | null;
  /** When the call happened; defaults to now, which is right for a fresh import. */
  callTime?: number;
}): Promise<ImportSummary> {
  const empty: ImportSummary = { created: 0, review: 0, duplicate: 0, discarded: 0 };

  const parsed = parseSpeakerTranscript(input.rawText);
  const transcript = parsed.text.trim();
  if (!transcript) return { ...empty, error: 'the transcript was empty' };

  const callerLabel = input.callerLabel?.trim() || 'Imported call';
  const callTime = input.callTime ?? Date.now();
  const id = newCallId();

  // Persist first. If extraction fails, the transcript is still kept and the
  // normal retry pass will pick it up rather than the import being lost.
  try {
    await db.insert(callRecords).values({
      id,
      callerLabel,
      callerNumber: null,
      callTime,
      // Length is genuinely unknown for an imported transcript. Storing null
      // rather than a guess is why getPendingAnalysis must not filter NULLs out.
      durationSec: null,
      recordingPath: null,
      transcript,
      summary: null,
      topics: '[]',
      taskIds: '[]',
      status: 'TRANSCRIBED',
      createdAt: Date.now(),
    });
  } catch (e) {
    return { ...empty, error: `could not save the transcript (${String(e).slice(0, 80)})` };
  }

  const extracted = await extractTasksFromTranscript(transcript, {
    referenceTime: callTime,
    callerLabel,
  });

  if (extracted === null) {
    // Left as TRANSCRIBED on purpose: the retry pass will try again rather than
    // the user having to re-import.
    await logActivity(
      'call',
      callerLabel,
      'ERROR',
      'Imported transcript saved — task extraction unavailable, will retry'
    ).catch(() => {});
    return { ...empty, error: 'task extraction is unavailable right now — saved for retry' };
  }

  // Mark handled before intake: intake deduplicates, so a repeat pass is safe,
  // but a crash mid-intake must not leave this looping forever.
  try {
    await db.update(callRecords).set({ status: 'EXTRACTED' }).where(eq(callRecords.id, id));
  } catch {
    // Non-fatal: the tasks below still get created, and the retry pass
    // deduplicates against them.
  }

  if (extracted.length === 0) {
    await logActivity('call', callerLabel, 'SKIPPED', 'No action items in imported call').catch(
      () => {}
    );
    return empty;
  }

  const candidates: TaskCandidate[] = extracted.map((t) => ({
    title: t.title,
    notes: t.notes ?? null,
    dueDate: t.dueDate,
    priority: t.priority,
    confidence: IMPORTED_TASK_CONFIDENCE,
    reasoning: `Extracted from an imported call transcript (${callerLabel})`,
    sourceType: 'CALL',
    sourceRef: id,
    sourceLabel: callerLabel,
    sourceApp: 'call',
    sourceText: transcript.slice(0, 1000),
    inferenceOrigin: 'IMPORTED',
  }));

  const summary = await intakeCandidates(candidates);

  await logActivity(
    'call',
    callerLabel,
    summary.created > 0 ? 'TASK_CREATED' : summary.review > 0 ? 'REVIEW' : 'SKIPPED',
    summary.created > 0
      ? `${summary.created} task(s) from imported call`
      : summary.review > 0
        ? `${summary.review} item(s) need review`
        : 'No new tasks from imported call'
  ).catch(() => {});

  return summary;
}
