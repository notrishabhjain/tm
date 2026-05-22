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
    // n_ctx=1024: richer prompts (few-shot examples) without OOM — only adds ~8 MB KV cache,
    // not model weights. use_mlock=false avoids mlock syscall failures on constrained devices.
    llamaCtx = await initLlama({
      model: modelPath,
      n_ctx: 1024,
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
  const s = typeof raw === 'string' ? raw.toUpperCase() : '';
  return VALID_PRIORITIES.has(s) ? (s as Priority) : 'MEDIUM';
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

// Strip Android status bar and common OCR noise before sending to the model.
export function preprocessOcrText(text: string): string {
  return text
    .replace(/^\d{1,2}:\d{2}\s*(AM|PM)?\s*/gim, '')
    .replace(/^\d+%\s*/gim, '')
    .replace(/^(No SIM|WiFi|4G|5G|LTE|Jio|Airtel|BSNL|Vi)\b.*/gim, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract the most relevant portion of OCR text based on the source app.
// This is the primary quality gate — a small model performs well on 10-15 clean
// lines but poorly on a 900-char OCR dump of a full phone screen.
export function extractAppSpecificText(ocrText: string, packageName: string): string {
  const pkg = packageName.toLowerCase();
  const lines = ocrText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  // ── WhatsApp / WhatsApp Business ──────────────────────────────────────────
  if (pkg.includes('whatsapp')) {
    // Everything below the input bar is UI chrome — cut it off.
    const inputMarkerIdx = lines.findIndex((l) =>
      /^(type a message|message\.\.\.|reply|sticker|gif|attach|audio|camera)/i.test(l)
    );
    const messageLines = inputMarkerIdx > 1 ? lines.slice(0, inputMarkerIdx) : lines;
    // Skip first line (contact/group name header) and take the last 15 message lines.
    const messages = messageLines.slice(1).slice(-15);
    return messages.join('\n') || ocrText.slice(-600);
  }

  // ── Telegram ──────────────────────────────────────────────────────────────
  if (pkg.includes('telegram')) {
    const inputMarkerIdx = lines.findIndex((l) =>
      /^(message|type here|write a message|reply|attach)/i.test(l)
    );
    const messageLines = inputMarkerIdx > 1 ? lines.slice(0, inputMarkerIdx) : lines;
    return messageLines.slice(1).slice(-15).join('\n') || ocrText.slice(-600);
  }

  // ── Gmail / generic email ─────────────────────────────────────────────────
  if (pkg.includes('gmail') || pkg.includes('mail') || pkg.includes('outlook')) {
    const subjectIdx = lines.findIndex((l) => /^subject[\s:]/i.test(l));
    const fromIdx = lines.findIndex((l) => /^from[\s:]/i.test(l));
    const startIdx = subjectIdx > -1 ? subjectIdx : fromIdx > -1 ? fromIdx : 0;
    // Subject line + up to 30 body lines
    return lines.slice(startIdx, startIdx + 30).join('\n') || ocrText.slice(0, 700);
  }

  // ── Slack / Teams / other work chat ──────────────────────────────────────
  if (pkg.includes('slack') || pkg.includes('teams') || pkg.includes('discord')) {
    // Take the last 15 lines (most recent messages at bottom)
    return lines.slice(-15).join('\n') || ocrText.slice(-600);
  }

  // ── Default: head (context) + tail (latest content) ──────────────────────
  const HEAD = 150;
  const TAIL = 600;
  return ocrText.length <= HEAD + TAIL
    ? ocrText
    : `${ocrText.slice(0, HEAD)}\n[...]\n${ocrText.slice(-TAIL)}`;
}

// Reject deadlines that are already past or implausibly far in the future (hallucinations).
function sanitizeDeadline(isoStr: string | null | undefined): number | null {
  if (!isoStr) return null;
  const ts = Date.parse(isoStr);
  if (isNaN(ts)) return null;
  const now = Date.now();
  if (ts < now - 24 * 3_600_000) return null;
  if (ts > now + 2 * 365 * 24 * 3_600_000) return null;
  return ts;
}

// Code-level overrides applied after LLM priority output — hybrid AI + rules.
function applyPriorityHeuristics(
  priority: Priority,
  title: string,
  deadline: number | null
): Priority {
  const text = title.toLowerCase();
  if (deadline && deadline - Date.now() < 24 * 3_600_000) return 'URGENT';
  if (/\b(asap|urgent|immediately|emergency|abhi|turant|bahut zaruri)\b/i.test(text))
    return 'URGENT';
  if (deadline && deadline - Date.now() < 72 * 3_600_000 && priority === 'MEDIUM') return 'HIGH';
  return priority;
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
  decision: 'CREATE' | 'CONFIRM' | 'DISCARD';
  title: string | null;
  priority: Priority;
  durationMs: number;
  language: 'en' | 'hi' | 'hinglish' | 'unknown';
  spamProbability: number;
}

// 8 static few-shot examples covering the full scenario space.
// Ordered: actionable first (anchors the model on positive examples).
const CLASSIFICATION_STATIC_EXAMPLES = [
  '[TASK] WhatsApp/Boss: "Send the updated report by 5pm today" → {"actionable":true,"confidence":92,"language":"en","spam_prob":2,"title":"Send updated report to Boss by 5pm","priority":"high"}',
  '[TASK] SMS: "EMI due 25 May. Pay now to avoid penalty" → {"actionable":true,"confidence":94,"language":"en","spam_prob":5,"title":"Pay EMI before 25 May","priority":"urgent"}',
  '[TASK] WhatsApp: "Kal tak payment kar dena bhai" → {"actionable":true,"confidence":88,"language":"hinglish","spam_prob":3,"title":"Make payment by tomorrow","priority":"high"}',
  '[TASK] WhatsApp: "Client ko aaj shaam update dena, important hai" → {"actionable":true,"confidence":87,"language":"hinglish","spam_prob":2,"title":"Update client this evening","priority":"high"}',
  '[SKIP] Gmail: "Your OTP is 847291. Do not share with anyone." → {"actionable":false,"confidence":99,"language":"en","spam_prob":99}',
  '[SKIP] Flipkart: "Mega Sale — 70% off on electronics. Today only!" → {"actionable":false,"confidence":96,"language":"en","spam_prob":96}',
  '[SKIP] Instagram: "Rahul liked your photo" → {"actionable":false,"confidence":98,"language":"en","spam_prob":90}',
  '[SKIP] WhatsApp: "Haan bhai, milte hain kabhi" → {"actionable":false,"confidence":84,"language":"hinglish","spam_prob":8}',
].join('\n');

// /no_think: Qwen3 directive to skip chain-of-thought (faster); ignored by Llama models.
function buildClassificationPrompt(examples: FewShotExample[]): string {
  const base =
    'You are a notification classifier. Determine if the notification requires the user to take action.\n\n' +
    'ACTIONABLE: reply needed, payment due, work task, meeting, deadline, document to send, follow up, purchase\n' +
    'NOT ACTIONABLE: OTP, promotion, ad, social like/follow, news, weather, casual greeting, spam\n\n' +
    'Languages: English, Hindi, Hinglish — understand all three.\n\n' +
    'Output ONLY valid JSON:\n' +
    '{"actionable":true,"confidence":85,"language":"en|hi|hinglish","spam_prob":5,"title":"task ≤80 chars","priority":"urgent|high|medium|low"}\n' +
    'or {"actionable":false,"confidence":90,"language":"en","spam_prob":85}\n\n' +
    'Examples:\n' +
    CLASSIFICATION_STATIC_EXAMPLES +
    '\n/no_think';

  if (examples.length === 0) return base;

  const userLines = examples.map((ex) => {
    const from = ex.sender ? `/${ex.sender}` : '';
    const head = `${ex.appName}${from}: "${ex.text.slice(0, 80)}"`;
    if (ex.decision === 'confirmed' && ex.title) {
      return `[TASK] ${head} → {"actionable":true,"title":"${ex.title.slice(0, 60)}"}`;
    }
    return `[SKIP] ${head} → {"actionable":false}`;
  });

  return `${base}\n\nYour recent decisions:\n${userLines.join('\n')}`;
}

export async function classifyNotification(params: {
  text: string;
  appName: string;
  sender: string | null;
  examples: FewShotExample[];
}): Promise<ClassifyResult | null> {
  if (!llamaCtx || !params.text.trim()) return null;
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
      n_predict: 100,
      temperature: 0.1,
      stop: STOP_TOKENS,
    });

    const durationMs = Date.now() - t0;
    const jsonStr = extractJson(getRawText(result));
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;

    const actionable = Boolean(parsed.actionable);

    // Normalize confidence: model may return 0-100 or 0-1
    const rawConf =
      typeof parsed.confidence === 'number' ? parsed.confidence : actionable ? 75 : 20;
    const confidence = Math.max(0, Math.min(1, rawConf > 1 ? rawConf / 100 : rawConf));

    const rawSpam = typeof parsed.spam_prob === 'number' ? parsed.spam_prob : actionable ? 5 : 80;
    const spamProbability = Math.max(0, Math.min(1, rawSpam > 1 ? rawSpam / 100 : rawSpam));

    const language = ((): ClassifyResult['language'] => {
      const l = String(parsed.language ?? '').toLowerCase();
      if (l === 'hi') return 'hi';
      if (l === 'hinglish') return 'hinglish';
      if (l === 'en') return 'en';
      return 'unknown';
    })();

    const title =
      actionable && typeof parsed.title === 'string' ? parsed.title.slice(0, 80).trim() : null;

    const rawPriority = typeof parsed.priority === 'string' ? parsed.priority.toUpperCase() : '';
    const priority = actionable ? parsePriority(rawPriority) : 'LOW';

    // High spam probability overrides actionable — never create tasks for OTPs/promos.
    const effectiveActionable = actionable && spamProbability < 0.7;

    const decision: ClassifyResult['decision'] = !effectiveActionable
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

    return {
      actionable: effectiveActionable,
      confidence,
      decision,
      title,
      priority,
      durationMs,
      language,
      spamProbability,
    };
  } catch {
    return null;
  } finally {
    inferenceInProgress = false;
  }
}

// ── Task 2: Screenshot / transcript extraction (on-demand) ───────────────────

// Base extraction prompt — current date + day injected at call time.
// Input is already app-specific pre-processed text (extractAppSpecificText), so
// the prompt focuses on task recognition, not on navigating OCR layout.
// /no_think: suppresses Qwen3 thinking tokens; Llama models treat it as plain text.
const TASK_SYSTEM_PROMPT_BASE =
  'You are a task extraction engine. Extract the most actionable task from the text.\n\n' +
  'Extract ONLY if user must: pay, reply, submit, attend, call, send, buy, complete, follow up.\n' +
  'SKIP: greetings, casual chat, passive info, OTPs, ads.\n' +
  'Languages: English, Hindi, Hinglish — understand all.\n' +
  'NEVER invent deadlines, names, or actions. Set deadline null if uncertain.\n\n' +
  'Output ONLY valid JSON:\n' +
  '{"tasks":[{"task_heading":"≤12 words","task_details":"≤40 words","deadline":"ISO8601 or null",' +
  '"priority":"urgent|high|medium|low","people":[],"tags":[],"confidence_score":0-100,"requires_followup":false}]}\n' +
  'No task: {"tasks":[]}\n\n' +
  'E1:"Electricity bill due 23 May. Late fee applies after." → ' +
  '{"tasks":[{"task_heading":"Pay electricity bill by 23 May","task_details":"Bill due 23 May, late fee after deadline.","deadline":null,"priority":"urgent","people":[],"tags":["bill","payment"],"confidence_score":93,"requires_followup":false}]}\n' +
  'E2:"Haan bhai, milte hain kabhi" → {"tasks":[]}\n' +
  'E3:"Please send revised DPR by Monday evening" → ' +
  '{"tasks":[{"task_heading":"Send revised DPR by Monday evening","task_details":"Submit revised DPR before Monday evening.","deadline":null,"priority":"high","people":[],"tags":["DPR","document"],"confidence_score":90,"requires_followup":false}]}\n' +
  'E4:"Kal tak payment kar dena bhai" → ' +
  '{"tasks":[{"task_heading":"Make payment by tomorrow","task_details":"Payment required by tomorrow.","deadline":null,"priority":"high","people":[],"tags":["payment"],"confidence_score":85,"requires_followup":false}]}\n' +
  'E5:"Meeting with EY team Friday 3 PM. Discuss blockchain architecture." → ' +
  '{"tasks":[{"task_heading":"Attend EY meeting Friday 3 PM","task_details":"Meeting with EY team on blockchain architecture.","deadline":null,"priority":"medium","people":["EY team"],"tags":["meeting","blockchain"],"confidence_score":93,"requires_followup":false}]}\n' +
  '/no_think';

export interface LlmTaskResult {
  title: string;
  body: string | null;
  priority: Priority;
  dueDate: number | null;
}

export async function extractTaskFromText(text: string): Promise<LlmTaskResult | null> {
  if (!llamaCtx || !text.trim()) return null;
  if (inferenceInProgress) return null;

  inferenceInProgress = true;
  try {
    const t0 = Date.now();

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const dayOfWeek = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ][now.getDay()];
    const systemPrompt = `Today: ${today} (${dayOfWeek}).\n${TASK_SYSTEM_PROMPT_BASE}`;

    // Head (first 200 chars): app name, email subject, sender — gives context.
    // Tail (last 700 chars): latest messages / email body — where the actual task lives.
    // For WhatsApp, newest messages are at the BOTTOM of OCR output, so tail is critical.
    const HEAD = 200;
    const TAIL = 700;
    const inputText =
      text.length <= HEAD + TAIL ? text : `${text.slice(0, HEAD)}\n[...]\n${text.slice(-TAIL)}`;

    const result = await llamaCtx.completion({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract tasks from:\n\n${inputText}` },
      ],
      n_predict: 200,
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

    // Support both new {"tasks":[...]} schema and legacy flat object.
    const tasksArr = Array.isArray(parsed.tasks) ? parsed.tasks : null;
    if (tasksArr && tasksArr.length === 0) return null;
    const first = (tasksArr ? tasksArr[0] : parsed) as Record<string, unknown>;

    const title = String(first.task_heading ?? first.title ?? '')
      .slice(0, 120)
      .trim();
    if (!title) return null;

    const body =
      typeof first.task_details === 'string' && first.task_details
        ? first.task_details.slice(0, 300).trim()
        : null;

    const deadline = sanitizeDeadline(typeof first.deadline === 'string' ? first.deadline : null);
    const priority = applyPriorityHeuristics(
      parsePriority(typeof first.priority === 'string' ? first.priority : ''),
      title,
      deadline
    );

    return { title, body, priority, dueDate: deadline };
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

  const TRANSCRIPT_SYSTEM_PROMPT =
    'Extract ALL actionable tasks from meeting transcript or long text.\n' +
    'Languages: English, Hindi, Hinglish. NEVER invent details. Max 20 tasks.\n' +
    'SKIP: OTPs, ads, greetings, passive info.\n' +
    'Output ONLY valid JSON array: [{"task_heading":"≤12 words","priority":"urgent|high|medium|low"}]\n' +
    'No tasks: []\n/no_think';

  inferenceInProgress = true;
  try {
    const result = await llamaCtx.completion({
      messages: [
        { role: 'system', content: TRANSCRIPT_SYSTEM_PROMPT },
        { role: 'user', content: `Extract all tasks from:\n\n${text.slice(0, 800)}` },
      ],
      n_predict: 300,
      temperature: 0.1,
      stop: STOP_TOKENS,
    });

    const jsonStr = extractJson(getRawText(result));
    const parsed = JSON.parse(jsonStr);
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed.tasks) ? parsed.tasks : [];
    return (arr as Record<string, unknown>[])
      .slice(0, 20)
      .map((item) => ({
        title: String(item.task_heading ?? item.title ?? '')
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
