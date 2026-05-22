import { initLlama, type LlamaContext } from 'llama.rn';
import { getLlmModelPath } from './llm-manager';
import { logLlmLoad, logLlmInference } from './analytics-logger';
import type { Priority } from '@/domain/types';

// ── State ─────────────────────────────────────────────────────────────────────

let llamaCtx: LlamaContext | null = null;
let lastLoadError: string | null = null;

// Prevents concurrent inference calls on the same context.
// If a notification arrives mid-screenshot-extraction, classification falls
// back to the rule engine (returns null) rather than corrupting the context.
let inferenceInProgress = false;

// ── Status queries ────────────────────────────────────────────────────────────

export function isLlmLoaded(): boolean {
  return llamaCtx !== null;
}

export function getLlmLoadError(): string | null {
  return lastLoadError;
}

export function isLlmBusy(): boolean {
  return inferenceInProgress;
}

// ── Load / unload ─────────────────────────────────────────────────────────────

export async function loadLlm(): Promise<boolean> {
  if (llamaCtx) return true;
  lastLoadError = null;
  const t0 = Date.now();
  try {
    const modelPath = getLlmModelPath().replace(/^file:\/\//, '');
    // n_ctx=768: fits classification (~300 tok) and extraction (~500 tok) with headroom.
    // use_mlock=false: avoids mlock syscall failures on RAM-constrained devices.
    // Compatible with Qwen3 and Llama GGUF models.
    llamaCtx = await initLlama({
      model: modelPath,
      n_ctx: 768,
      n_threads: 4,
      n_batch: 64,
      use_mlock: false,
    });
    void logLlmLoad('on-device-llm', Date.now() - t0);
    return true;
  } catch (err) {
    lastLoadError = err instanceof Error ? err.message : String(err);
    llamaCtx = null;
    return false;
  }
}

export async function unloadLlm(): Promise<void> {
  if (llamaCtx) {
    const ctx = llamaCtx;
    llamaCtx = null;
    try {
      await ctx.release();
    } catch {
      /* non-fatal */
    }
  }
}

// ── Shared helpers ────────────────────────────────────────────────────────────

const STOP_TOKENS = ['<|im_end|>', '<|endoftext|>', '<|eot_id|>'];
const VALID_PRIORITIES = new Set<string>(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);

function parsePriority(raw: unknown): Priority {
  return typeof raw === 'string' && VALID_PRIORITIES.has(raw) ? (raw as Priority) : 'MEDIUM';
}

function extractJson(raw: string): string {
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const start = noThink.search(/[{[]/);
  if (start === -1) return noThink;
  const opener = noThink[start];
  const closer = opener === '{' ? '}' : ']';
  const end = noThink.lastIndexOf(closer);
  if (end === -1) return noThink;
  return noThink.slice(start, end + 1);
}

function getRawText(result: unknown): string {
  if (typeof result !== 'object' || result === null) return '';
  const r = result as Record<string, unknown>;
  return String(r.content ?? r.text ?? '');
}

// ── Task 1: Notification classification (auto-triggered) ─────────────────────

export interface FewShotExample {
  appName: string;
  sender: string | null;
  text: string;
  decision: 'confirmed' | 'rejected';
  title: string | null;
}

export interface ClassifyResult {
  actionable: boolean;
  confidence: number;
  title: string | null;
  priority: Priority;
  durationMs: number;
}

function buildClassificationPrompt(examples: FewShotExample[]): string {
  // /no_think: Qwen3 directive to skip chain-of-thought (faster); ignored by Llama models
  const base =
    'You are a notification classifier. Decide if a notification requires the user to take action.\n\n' +
    'Output ONLY valid JSON with no explanation:\n' +
    '{"actionable":true,"confidence":0.85,"title":"Task title ≤80 chars","priority":"URGENT|HIGH|MEDIUM|LOW"}\n' +
    'or {"actionable":false,"confidence":0.9,"title":null,"priority":null}\n\n' +
    'Priority: URGENT=emergency/same-day deadline, HIGH=reply needed soon, MEDIUM=action needed, LOW=optional\n' +
    '/no_think';

  if (examples.length === 0) return base;

  const lines = examples.map((ex) => {
    const from = ex.sender ? ` From:${ex.sender}` : '';
    const head = `App:${ex.appName}${from} | "${ex.text.slice(0, 80)}"`;
    if (ex.decision === 'confirmed' && ex.title) {
      return `[TASK] ${head} → {"actionable":true,"title":"${ex.title.slice(0, 60)}"}`;
    }
    return `[SKIP] ${head} → {"actionable":false}`;
  });

  return `${base}\n\nRecent examples from this user:\n${lines.join('\n')}`;
}

export async function classifyNotification(params: {
  text: string;
  appName: string;
  sender: string | null;
  examples: FewShotExample[];
}): Promise<ClassifyResult | null> {
  if (!llamaCtx || !params.text.trim()) return null;
  // If another inference is running (e.g. screenshot extraction), skip and fall
  // back to the rule engine — better than queueing or corrupting the context.
  if (inferenceInProgress) return null;

  inferenceInProgress = true;
  const t0 = Date.now();
  try {
    const result = await llamaCtx.completion({
      messages: [
        { role: 'system', content: buildClassificationPrompt(params.examples) },
        {
          role: 'user',
          content: `App:${params.appName}${params.sender ? ` | From:${params.sender}` : ''}\n${params.text.slice(0, 400)}`,
        },
      ],
      n_predict: 80,
      temperature: 0.1,
      stop: STOP_TOKENS,
    });

    const durationMs = Date.now() - t0;
    const jsonStr = extractJson(getRawText(result));
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const actionable = Boolean(parsed.actionable);
    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.max(0, Math.min(1, parsed.confidence))
        : actionable
          ? 0.75
          : 0.2;
    const title =
      actionable && typeof parsed.title === 'string' ? parsed.title.slice(0, 80).trim() : null;
    const priority = actionable ? parsePriority(parsed.priority) : 'LOW';

    const decision: 'CREATE' | 'CONFIRM' | 'DISCARD' = !actionable
      ? 'DISCARD'
      : confidence >= 0.75
        ? 'CREATE'
        : confidence >= 0.35
          ? 'CONFIRM'
          : 'DISCARD';
    void logLlmInference({
      modelId: 'on-device-llm',
      durationMs,
      decision,
      confidence,
      inputLength: params.text.length,
    });

    return { actionable, confidence, title, priority, durationMs };
  } catch {
    return null;
  } finally {
    inferenceInProgress = false;
  }
}

// ── Task 2: Screenshot / transcript extraction (on-demand) ───────────────────

// /no_think: suppresses Qwen3 thinking tokens; Llama models treat it as plain text (harmless)
const TASK_SYSTEM_PROMPT =
  'You are a task extraction assistant. Extract the single most actionable task from phone screen text. ' +
  'Chat apps (WhatsApp, Telegram): focus on the LATEST messages at the END of the text — ignore old messages at top. ' +
  'Email: use the subject line and body. Ignore UI chrome (app name, status bar, Back/Send buttons). ' +
  'Output ONLY valid JSON, no markdown, no explanation: ' +
  '{"title":"specific action ≤120 chars","priority":"URGENT|HIGH|MEDIUM|LOW","dueDate":"ISO8601 or null"} /no_think';

const TRANSCRIPT_SYSTEM_PROMPT =
  'You are a task extraction assistant. Given a meeting transcript or long text, ' +
  'extract ALL actionable tasks. Respond with ONLY a valid JSON array — ' +
  'no markdown fences, no explanation. ' +
  'Each element: {"title": string ≤120 chars, "priority": URGENT|HIGH|MEDIUM|LOW}. ' +
  'Maximum 20 items. /no_think';

export interface LlmTaskResult {
  title: string;
  priority: Priority;
  dueDate: number | null;
}

export async function extractTaskFromText(text: string): Promise<LlmTaskResult | null> {
  if (!llamaCtx || !text.trim()) return null;
  if (inferenceInProgress) return null;

  inferenceInProgress = true;
  try {
    const t0 = Date.now();
    // Head (first 200 chars): app name, email subject, sender — gives context.
    // Tail (last 700 chars): latest chat messages / email body — where the actual task lives.
    // WhatsApp/chat: newest messages are at the BOTTOM of OCR output, so tail is critical.
    const HEAD = 200;
    const TAIL = 700;
    const inputText =
      text.length <= HEAD + TAIL ? text : `${text.slice(0, HEAD)}\n[...]\n${text.slice(-TAIL)}`;

    const result = await llamaCtx.completion({
      messages: [
        { role: 'system', content: TASK_SYSTEM_PROMPT },
        { role: 'user', content: `Extract the task from:\n\n${inputText}` },
      ],
      n_predict: 120,
      temperature: 0.1,
      stop: STOP_TOKENS,
    });

    void logLlmInference({
      modelId: 'on-device-llm',
      durationMs: Date.now() - t0,
      decision: 'CREATE',
      confidence: 0.92,
      inputLength: text.length,
    });

    const jsonStr = extractJson(getRawText(result));
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const title = String(parsed.title ?? '')
      .slice(0, 120)
      .trim();
    if (!title) return null;

    let dueDate: number | null = null;
    if (typeof parsed.dueDate === 'string' && parsed.dueDate) {
      const ts = Date.parse(parsed.dueDate);
      if (!isNaN(ts)) dueDate = ts;
    }
    return { title, priority: parsePriority(parsed.priority), dueDate };
  } catch {
    return null;
  } finally {
    inferenceInProgress = false;
  }
}

export async function extractTasksFromTranscript(
  text: string
): Promise<Array<{ title: string; priority: Priority }>> {
  if (!llamaCtx || !text.trim()) return [];
  if (inferenceInProgress) return [];

  inferenceInProgress = true;
  try {
    const result = await llamaCtx.completion({
      messages: [
        { role: 'system', content: TRANSCRIPT_SYSTEM_PROMPT },
        // 800 chars ≈ 250 tokens; fits within n_ctx=768 with system prompt + output
        {
          role: 'user',
          content: `Extract all actionable tasks from:\n\n${text.slice(0, 800)}`,
        },
      ],
      n_predict: 300,
      temperature: 0.1,
      stop: STOP_TOKENS,
    });

    const jsonStr = extractJson(getRawText(result));
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 20)
      .map((item: Record<string, unknown>) => ({
        title: String(item.title ?? '')
          .slice(0, 120)
          .trim(),
        priority: parsePriority(item.priority),
      }))
      .filter((t) => t.title.length > 0);
  } catch {
    return [];
  } finally {
    inferenceInProgress = false;
  }
}

// Keep export alias so transcript-import.tsx continues to work
export { extractTaskFromText as extractTaskFromTextLlm };
