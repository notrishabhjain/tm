/**
 * High-level TypeScript wrapper around the LlmInference native module.
 *
 * Provides two public APIs:
 *   extractTaskFromText   — single task from screenshot OCR / notification text
 *   extractTasksFromTranscript — batch task extraction from a meeting transcript
 *
 * Both return null / [] gracefully when the LLM is not loaded so callers can
 * fall back to the rule engine without special-casing.
 */

import { LlmInference } from '../../modules/notification-listener/src';
import { getLlmModelDir } from './llm-manager';
import type { Priority } from '@/domain/types';

let llmLoaded = false;

export function isLlmLoaded(): boolean {
  return llmLoaded || LlmInference.isModelLoaded();
}

export async function loadLlm(): Promise<boolean> {
  if (llmLoaded) return true;
  try {
    await LlmInference.loadModel(getLlmModelDir());
    llmLoaded = true;
    return true;
  } catch {
    llmLoaded = false;
    return false;
  }
}

export function unloadLlm(): void {
  LlmInference.unloadModel();
  llmLoaded = false;
}

// ── Prompts ───────────────────────────────────────────────────────────────────

const TASK_SYSTEM_PROMPT = `You are a task extraction assistant. Given text from a phone screen or message, extract the single most actionable task. Respond with ONLY a valid JSON object — no markdown fences, no explanation. JSON keys: "title" (string ≤120 chars), "priority" (one of URGENT HIGH MEDIUM LOW), "dueDate" (ISO 8601 date string or null).`;

const TRANSCRIPT_SYSTEM_PROMPT = `You are a task extraction assistant. Given a meeting transcript or long text, extract ALL actionable tasks. Respond with ONLY a valid JSON array — no markdown fences, no explanation. Each element: {"title": string ≤120 chars, "priority": URGENT|HIGH|MEDIUM|LOW}. Maximum 20 items.`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const VALID_PRIORITIES = new Set<string>(['URGENT', 'HIGH', 'MEDIUM', 'LOW']);

function parsePriority(raw: unknown): Priority {
  return typeof raw === 'string' && VALID_PRIORITIES.has(raw) ? (raw as Priority) : 'MEDIUM';
}

function extractJson(raw: string): string {
  // Strip any leading thinking tags Qwen3 might emit despite the system prompt
  const noThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  // Find first { or [
  const start = noThink.search(/[{[]/);
  if (start === -1) return noThink;
  // Find matching close bracket
  const opener = noThink[start];
  const closer = opener === '{' ? '}' : ']';
  const end = noThink.lastIndexOf(closer);
  if (end === -1) return noThink;
  return noThink.slice(start, end + 1);
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface LlmTaskResult {
  title: string;
  priority: Priority;
  /** Unix timestamp (ms) or null if no due date was found. */
  dueDate: number | null;
}

/**
 * Extract a single task from OCR/notification text using the LLM.
 * Returns null if the LLM is not loaded or if parsing fails.
 */
export async function extractTaskFromText(text: string): Promise<LlmTaskResult | null> {
  if (!isLlmLoaded()) return null;
  if (!text.trim()) return null;

  try {
    const raw = await LlmInference.generate(
      TASK_SYSTEM_PROMPT,
      `Extract the main task from:\n\n${text.slice(0, 2000)}`,
      200
    );
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
    const title = String(parsed.title ?? '').slice(0, 120).trim();
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
 * Returns [] if the LLM is not loaded or if parsing fails.
 */
export async function extractTasksFromTranscript(
  text: string
): Promise<Array<{ title: string; priority: Priority }>> {
  if (!isLlmLoaded()) return [];
  if (!text.trim()) return [];

  try {
    const raw = await LlmInference.generate(
      TRANSCRIPT_SYSTEM_PROMPT,
      `Extract all actionable tasks from:\n\n${text.slice(0, 4000)}`,
      1000
    );
    const jsonStr = extractJson(raw);
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .slice(0, 20)
      .map((item: Record<string, unknown>) => ({
        title: String(item.title ?? '').slice(0, 120).trim(),
        priority: parsePriority(item.priority),
      }))
      .filter((t) => t.title.length > 0);
  } catch {
    return [];
  }
}
