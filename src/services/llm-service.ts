/**
 * High-level wrapper around llama.rn (llama.cpp) for on-device LLM inference.
 *
 * Provides two public APIs:
 *   extractTaskFromText        — single task from screenshot OCR / notification text
 *   extractTasksFromTranscript — batch task extraction from a meeting transcript
 *
 * Both return null / [] gracefully when the LLM is not loaded.
 */

import { initLlama, type LlamaContext } from 'llama.rn';
import { getLlmModelPath } from './llm-manager';
import type { Priority } from '@/domain/types';

let llamaCtx: LlamaContext | null = null;

export function isLlmLoaded(): boolean {
  return llamaCtx !== null;
}

export async function loadLlm(): Promise<boolean> {
  if (llamaCtx) return true;
  try {
    llamaCtx = await initLlama({
      model: getLlmModelPath(),
      n_ctx: 2048,
      n_threads: 4,
      n_batch: 512,
    });
    return true;
  } catch {
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

// ── Prompts ───────────────────────────────────────────────────────────────────

const TASK_SYSTEM_PROMPT =
  'You are a task extraction assistant. Given text from a phone screen or message, ' +
  'extract the single most actionable task. Respond with ONLY a valid JSON object — ' +
  'no markdown fences, no explanation. ' +
  'JSON keys: "title" (string ≤120 chars), "priority" (one of URGENT HIGH MEDIUM LOW), ' +
  '"dueDate" (ISO 8601 date string or null). /no_think';

const TRANSCRIPT_SYSTEM_PROMPT =
  'You are a task extraction assistant. Given a meeting transcript or long text, ' +
  'extract ALL actionable tasks. Respond with ONLY a valid JSON array — ' +
  'no markdown fences, no explanation. ' +
  'Each element: {"title": string ≤120 chars, "priority": URGENT|HIGH|MEDIUM|LOW}. ' +
  'Maximum 20 items. /no_think';

// Qwen3 end-of-turn stop tokens
const STOP_TOKENS = ['<|im_end|>', '<|endoftext|>'];

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_PRIORITIES = new Set<string>(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);

function parsePriority(raw: unknown): Priority {
  return typeof raw === 'string' && VALID_PRIORITIES.has(raw) ? (raw as Priority) : 'MEDIUM';
}

function extractJson(raw: string): string {
  // Strip any thinking block Qwen3 might still emit
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

// ── Public API ────────────────────────────────────────────────────────────────

export interface LlmTaskResult {
  title: string;
  priority: Priority;
  /** Unix timestamp (ms) or null if no due date detected. */
  dueDate: number | null;
}

/**
 * Extract a single task from OCR/notification text using the on-device LLM.
 * Returns null when the LLM is not loaded or when parsing fails.
 */
export async function extractTaskFromText(text: string): Promise<LlmTaskResult | null> {
  if (!llamaCtx || !text.trim()) return null;
  try {
    const result = await llamaCtx.completion({
      messages: [
        { role: 'system', content: TASK_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract the main task from:\n\n${text.slice(0, 2000)}`,
        },
      ],
      n_predict: 200,
      temperature: 0.1,
      stop: STOP_TOKENS,
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
  }
}

/**
 * Extract multiple tasks from a long text (meeting transcript, email thread, etc.).
 * Returns [] when the LLM is not loaded or when parsing fails.
 */
export async function extractTasksFromTranscript(
  text: string
): Promise<Array<{ title: string; priority: Priority }>> {
  if (!llamaCtx || !text.trim()) return [];
  try {
    const result = await llamaCtx.completion({
      messages: [
        { role: 'system', content: TRANSCRIPT_SYSTEM_PROMPT },
        {
          role: 'user',
          content: `Extract all actionable tasks from:\n\n${text.slice(0, 4000)}`,
        },
      ],
      n_predict: 1000,
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
  }
}
