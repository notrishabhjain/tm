import type { PreprocessResult } from './types';

/**
 * Stage 2: Normalize and prepare text for the rule engine.
 *
 * Steps:
 * 1. Preserve original as rawSourceText.
 * 2. NFC Unicode normalize.
 * 3. Lowercase Latin characters only (Devanagari case is meaningless).
 * 4. Strip leading/trailing whitespace, collapse internal whitespace.
 * 5. Count words.
 */
export function preprocess(text: string): PreprocessResult {
  const original = text.trim();

  const normalized = original
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  // Word count: split on whitespace
  const wordCount = normalized.length === 0 ? 0 : normalized.split(/\s+/).length;

  return { normalized, original, wordCount };
}

/**
 * Combine notification fields into a single searchable string.
 * Preference: bigText > text, prepended with title.
 */
export function combineNotificationFields(
  title: string,
  text: string,
  bigText: string,
): string {
  const body = bigText.trim() || text.trim();
  const combined = [title.trim(), body].filter(Boolean).join(' ');
  return combined;
}
