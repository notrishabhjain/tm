import type { Language } from '../entities/Task';
import type { LanguageDetectionResult } from './types';

// Unicode ranges for Devanagari script
const DEVANAGARI_REGEX = /[\u0900-\u097F\u1CD0-\u1CFF\uA8E0-\uA8FF]/;
// Latin letters (simplified)
const LATIN_REGEX = /[a-zA-Z]/;
// Minimum Devanagari characters to classify as Hindi
const MIN_DEVANAGARI_CHARS = 3;

/**
 * Stage 1: Detect the language of a notification text.
 *
 * Classification:
 * - "hi"    → predominantly Devanagari script
 * - "en"    → only Latin characters
 * - "hi-en" → mix of both (Hinglish)
 *
 * This is a heuristic v1 — no ML required.
 */
export function detectLanguage(text: string): LanguageDetectionResult {
  const devanagariCount = (text.match(/[\u0900-\u097F]/g) ?? []).length;
  const latinCount = (text.match(/[a-zA-Z]/g) ?? []).length;

  const hasDevanagari = devanagariCount >= MIN_DEVANAGARI_CHARS;
  const hasLatin = latinCount > 0;

  let language: Language;
  if (hasDevanagari && hasLatin) {
    language = 'hi-en';
  } else if (hasDevanagari) {
    language = 'hi';
  } else {
    language = 'en';
  }

  return { language, hasDevanagari, hasLatin };
}
