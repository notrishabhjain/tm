import { db } from '@/data/db/client';
import {
  TaskRepository,
  type TaskPriority,
  type TaskSourceType,
} from '@/data/repositories/TaskRepository';
import { logActivity, enqueueOutbox } from '@/data/pipeline-store';
import { getSetting } from '@/data/storage/settings';
import { buildGoogleTaskNotes } from './google-tasks';

const repo = new TaskRepository(db);

// ── Confidence gating ────────────────────────────────────────────────────────
// A small on-device classifier is less reliable than the 70B cloud model it
// replaces, so confidence decides disposition rather than being advisory.
// Auto-create only when the classifier is clearly sure; send the middle band to
// the Review Inbox rather than choosing between a wrong task and a lost one.
export const CONFIDENCE_AUTO_CREATE = 0.75;
export const CONFIDENCE_REVIEW_FLOOR = 0.4;

/** Titles longer than this are truncated — Google Tasks and the UI both suffer. */
const MAX_TITLE_CHARS = 120;
const MAX_NOTES_CHARS = 2000;
const MAX_SOURCE_TEXT_CHARS = 1000;

/**
 * How far into the past a resolved due date may be before we distrust it.
 * A deadline that has just passed is a real, useful overdue task. One resolved
 * to days ago is almost always the model mis-resolving a relative expression,
 * since extraction runs within minutes of the message arriving.
 */
const MAX_PAST_DUE_MS = 12 * 60 * 60 * 1000;

export type IntakeDisposition = 'CREATED' | 'REVIEW' | 'DUPLICATE' | 'DISCARDED' | 'INVALID';

export interface TaskCandidate {
  title: string | null | undefined;
  notes?: string | null;
  dueDate?: number | null;
  priority?: string | null;
  /** 0..1. Undefined or unusable means "unknown", which routes to review. */
  confidence?: number | null;
  reasoning?: string | null;
  sourceType: TaskSourceType;
  /** Notification fingerprint or call_records.id. Null for manual entry. */
  sourceRef: string | null;
  sourceLabel: string | null;
  sourceApp: string | null;
  /** Original message or transcript excerpt, shown in the Review Inbox. */
  sourceText?: string | null;
  inferenceOrigin?: string | null;
  modelId?: string | null;
}

export interface IntakeResult {
  disposition: IntakeDisposition;
  taskId?: string;
  reason?: string;
}

// ── Normalisation ────────────────────────────────────────────────────────────

// Deliberately an explicit ASCII set plus the Devanagari danda, rather than a
// Unicode property escape: property escapes are not reliably supported across
// Hermes builds, and a regex that fails to parse takes the whole bundle down.
const PUNCTUATION = /[!-/:-@[-`{-~‐-‧‰-⁞।॥]/g;

/** Politeness and filler that carries no task meaning but breaks exact dedup. */
const FILLER_PREFIXES = ['please', 'kindly', 'pls', 'plz', 'can you', 'could you', 'zara', 'thoda'];

export function normaliseTitle(raw: string): string {
  let t = raw.replace(/\s+/g, ' ').trim();
  // Models frequently wrap the title in quotes; they are never meaningful.
  t = t.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim();
  if (t.length > MAX_TITLE_CHARS) {
    // Cut at a word boundary where one is available, so titles do not end mid-word.
    const cut = t.slice(0, MAX_TITLE_CHARS);
    const lastSpace = cut.lastIndexOf(' ');
    t = (lastSpace > MAX_TITLE_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut).trim() + '…';
  }
  return t;
}

/**
 * Dedup key. Two extractions of the same commitment — from a re-delivered
 * notification, or from two overlapping transcript segments — must collapse to
 * one task, so the key ignores case, punctuation and politeness.
 */
export function titleKeyOf(title: string): string {
  let k = title.toLowerCase().replace(PUNCTUATION, ' ').replace(/\s+/g, ' ').trim();
  let changed = true;
  while (changed) {
    changed = false;
    for (const prefix of FILLER_PREFIXES) {
      if (k.startsWith(prefix + ' ')) {
        k = k.slice(prefix.length + 1).trim();
        changed = true;
      }
    }
  }
  return k;
}

function normalisePriority(raw: unknown): TaskPriority {
  const p = typeof raw === 'string' ? raw.toUpperCase().trim() : '';
  return p === 'URGENT' || p === 'HIGH' || p === 'LOW' || p === 'MEDIUM'
    ? (p as TaskPriority)
    : 'MEDIUM';
}

/** Returns a usable due timestamp, or null when the value cannot be trusted.
 *  Exported for tests — the rejection rules are the part most worth pinning. */
export function normaliseDueDate(raw: unknown, now: number): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  // Guard against seconds-vs-milliseconds and obviously absurd values.
  if (raw < 946_684_800_000) return null; // before 2000-01-01 → not a real deadline
  if (raw > now + 5 * 365 * 24 * 60 * 60 * 1000) return null; // >5 years out
  if (raw < now - MAX_PAST_DUE_MS) return null; // stale resolution, not an overdue task
  return raw;
}

function clampConfidence(raw: unknown): number | null {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return null;
  if (raw < 0) return 0;
  if (raw > 1) return 1;
  return raw;
}

function truncate(v: string | null | undefined, max: number): string | null {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

let _idCounter = 0;
function newId(prefix: string): string {
  _idCounter = (_idCounter + 1) % 100000;
  return `${prefix}_${Date.now().toString(36)}_${_idCounter.toString(36)}_${Math.floor(
    Math.random() * 1e6
  ).toString(36)}`;
}

// ── Intake ───────────────────────────────────────────────────────────────────

/**
 * The single path by which anything becomes a task. Every extractor — the
 * notification pipeline, the call pipeline, manual entry, the Review Inbox —
 * funnels through here so validation, gating and deduplication cannot diverge
 * between them.
 *
 * Never throws: a failure to record one candidate must not abort a batch or
 * take down a headless context.
 */
export async function intakeCandidate(candidate: TaskCandidate): Promise<IntakeResult> {
  try {
    const now = Date.now();

    // 1. Title is the one field without which nothing can exist.
    const rawTitle = typeof candidate.title === 'string' ? candidate.title : '';
    const title = normaliseTitle(rawTitle);
    if (!title || title === '…') {
      return { disposition: 'INVALID', reason: 'empty title' };
    }
    const titleKey = titleKeyOf(title);
    if (!titleKey) {
      // A title made entirely of punctuation normalises to nothing and would
      // collide with every other such title in the dedup index.
      return { disposition: 'INVALID', reason: 'title has no content' };
    }

    const priority = normalisePriority(candidate.priority);
    const dueAt = normaliseDueDate(candidate.dueDate, now);
    const confidence = clampConfidence(candidate.confidence);
    const notes = truncate(candidate.notes, MAX_NOTES_CHARS);
    const sourceLabel = truncate(candidate.sourceLabel, 120);
    const sourceApp = truncate(candidate.sourceApp, 120);
    const inferenceOrigin = truncate(candidate.inferenceOrigin, 40) ?? 'UNKNOWN';

    // 2. Gate on confidence. Unknown confidence is treated as uncertain, never
    //    as certain — a classifier that cannot say how sure it is does not get
    //    to write to the user's task list unreviewed.
    const band =
      confidence == null
        ? 'REVIEW'
        : confidence >= CONFIDENCE_AUTO_CREATE
          ? 'AUTO'
          : confidence >= CONFIDENCE_REVIEW_FLOOR
            ? 'REVIEW'
            : 'DISCARD';

    if (band === 'DISCARD') {
      await logActivity(
        candidate.sourceApp ?? 'unknown',
        sourceLabel ?? 'Unknown',
        'SKIPPED',
        `Below confidence floor (${confidence?.toFixed(2) ?? '?'}): ${title}`
      ).catch(() => {});
      return { disposition: 'DISCARDED', reason: 'below confidence floor' };
    }

    if (band === 'REVIEW') {
      await repo.insertReview({
        id: newId('rv'),
        title,
        titleKey,
        notes,
        dueAt,
        priority,
        sourceType: candidate.sourceType,
        sourceRef: candidate.sourceRef,
        sourceLabel,
        sourceApp,
        sourceText: truncate(candidate.sourceText, MAX_SOURCE_TEXT_CHARS),
        reasoning: truncate(candidate.reasoning, 500),
        confidence,
        inferenceOrigin,
        state: 'PENDING',
        createdAt: now,
      });
      await logActivity(
        candidate.sourceApp ?? 'unknown',
        sourceLabel ?? 'Unknown',
        'REVIEW',
        `Needs review: ${title}`
      ).catch(() => {});
      return { disposition: 'REVIEW' };
    }

    // 3. Auto-create.
    return await createTaskRow({
      title,
      titleKey,
      notes,
      dueAt,
      priority,
      confidence,
      inferenceOrigin,
      modelId: truncate(candidate.modelId, 80),
      sourceType: candidate.sourceType,
      sourceRef: candidate.sourceRef,
      sourceLabel,
      sourceApp,
      now,
    });
  } catch (e) {
    // Intake must never propagate: the caller is usually a background context
    // where an exception loses the whole batch.
    return { disposition: 'INVALID', reason: String(e).slice(0, 120) };
  }
}

interface CreateArgs {
  title: string;
  titleKey: string;
  notes: string | null;
  dueAt: number | null;
  priority: TaskPriority;
  confidence: number | null;
  inferenceOrigin: string | null;
  modelId?: string | null;
  sourceType: TaskSourceType;
  sourceRef: string | null;
  sourceLabel: string | null;
  sourceApp: string | null;
  now: number;
}

async function createTaskRow(a: CreateArgs): Promise<IntakeResult> {
  const id = newId('tk');
  // Google sync is optional and off by default in v3; when it is on, the task
  // is queued rather than pushed inline so a slow network cannot stall intake.
  const syncEnabled = getSetting('google_tasks_enabled');

  const created = await repo.insert({
    id,
    title: a.title,
    titleKey: a.titleKey,
    notes: a.notes,
    dueAt: a.dueAt,
    priority: a.priority,
    status: 'ACTIVE',
    sourceType: a.sourceType,
    sourceRef: a.sourceRef,
    sourceLabel: a.sourceLabel,
    sourceApp: a.sourceApp,
    confidence: a.confidence,
    inferenceOrigin: a.inferenceOrigin,
    modelId: a.modelId ?? null,
    remoteId: null,
    syncState: syncEnabled ? 'PENDING' : 'LOCAL_ONLY',
    completedAt: null,
    createdAt: a.now,
    updatedAt: a.now,
  });

  if (!created) {
    return { disposition: 'DUPLICATE', reason: 'already captured from this source' };
  }

  if (syncEnabled) {
    // The existing outbox already survives process death and drains in the
    // background, so reuse it rather than inventing a second queue.
    await enqueueOutbox(
      a.title,
      buildGoogleTaskNotes({
        priority: a.priority,
        sender: a.sourceLabel,
        sourceApp: a.sourceApp,
        dueDate: a.dueAt,
        body: a.notes,
      }),
      a.dueAt
    ).catch(() => {});
  }

  await logActivity(
    a.sourceApp ?? 'unknown',
    a.sourceLabel ?? 'Unknown',
    'TASK_CREATED',
    a.title
  ).catch(() => {});

  return { disposition: 'CREATED', taskId: id };
}

/**
 * Batch intake for extractors that yield several candidates at once (a call
 * transcript typically does). Candidates are deduplicated against each other
 * before hitting the database so one call cannot produce two rows that differ
 * only by wording.
 */
export async function intakeCandidates(
  candidates: TaskCandidate[]
): Promise<{ created: number; review: number; duplicate: number; discarded: number }> {
  const seen = new Set<string>();
  const summary = { created: 0, review: 0, duplicate: 0, discarded: 0 };

  for (const candidate of candidates) {
    const title = typeof candidate.title === 'string' ? normaliseTitle(candidate.title) : '';
    const key = title ? titleKeyOf(title) : '';
    if (key && seen.has(key)) {
      summary.duplicate++;
      continue;
    }
    if (key) seen.add(key);

    const result = await intakeCandidate(candidate);
    if (result.disposition === 'CREATED') summary.created++;
    else if (result.disposition === 'REVIEW') summary.review++;
    else if (result.disposition === 'DUPLICATE') summary.duplicate++;
    else summary.discarded++;
  }
  return summary;
}

/** Accepts a pending review item, turning it into a real task. Idempotent. */
export async function acceptReviewItem(id: string): Promise<IntakeResult> {
  try {
    const item = await repo.getReviewById(id);
    if (!item) return { disposition: 'INVALID', reason: 'not found' };
    if (item.state !== 'PENDING') {
      // Double-tap, or resolved in another context — not an error.
      return { disposition: 'DUPLICATE', reason: 'already resolved' };
    }
    const now = Date.now();
    const result = await createTaskRow({
      title: item.title,
      titleKey: titleKeyOf(item.title),
      notes: item.notes,
      // A due date that has gone stale while the item waited must not resurrect
      // as an already-overdue task the user never agreed to.
      dueAt: normaliseDueDate(item.dueAt, now),
      priority: item.priority,
      confidence: item.confidence,
      inferenceOrigin: item.inferenceOrigin,
      sourceType: item.sourceType,
      sourceRef: item.sourceRef,
      sourceLabel: item.sourceLabel,
      sourceApp: item.sourceApp,
      now,
    });
    await repo.resolveReview(id, 'ACCEPTED');
    return result;
  } catch (e) {
    return { disposition: 'INVALID', reason: String(e).slice(0, 120) };
  }
}

/** Dismisses a pending review item. Idempotent. */
export async function dismissReviewItem(id: string): Promise<void> {
  await repo.resolveReview(id, 'DISMISSED').catch(() => {});
}

/** Creates a task the user typed themselves — always trusted, never deduped. */
export async function createManualTask(input: {
  title: string;
  notes?: string | null;
  dueAt?: number | null;
  priority?: string | null;
}): Promise<IntakeResult> {
  return intakeCandidate({
    title: input.title,
    notes: input.notes ?? null,
    dueDate: input.dueAt ?? null,
    priority: input.priority ?? 'MEDIUM',
    confidence: 1,
    sourceType: 'MANUAL',
    sourceRef: null,
    sourceLabel: null,
    sourceApp: 'manual',
    inferenceOrigin: 'MANUAL',
  });
}
