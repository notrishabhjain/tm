import type { Language } from '../types';

// Devanagari Unicode range: U+0900–U+097F
const DEVANAGARI_REGEX = /[ऀ-ॿ]/;

// Common Hinglish/transliterated Hindi words (Latin script only, no English cognates)
const HINGLISH_MARKERS = new Set([
  'kar',
  'karo',
  'karna',
  'kiya',
  'kiye',
  'karein',
  'bhej',
  'bhejo',
  'bhejdo',
  'bhejna',
  'dekh',
  'dekho',
  'dekhna',
  'dekhe',
  'bata',
  'batao',
  'batana',
  'aaj',
  'kal',
  'parso',
  'abhi',
  'jaldi',
  'zaroor',
  'bhai',
  'yaar',
  'nahi',
  'hai',
  'hain',
  'mujhe',
  'tujhe',
  'humein',
  'unhe',
  'kab',
  'kyun',
  'kaise',
  'kahan',
  'tak',
  'bilkul',
  'theek',
  'accha',
  'sahi',
  'galat',
  'milna',
  'aana',
  'jana',
]);

export function detectLanguage(text: string): Language {
  if (!text || text.trim().length === 0) return 'EN';

  const hasDevanagari = DEVANAGARI_REGEX.test(text);
  if (hasDevanagari) {
    // Check if there's also Latin script (mixed)
    const latinRatio = (text.match(/[a-zA-Z]/g) || []).length / text.length;
    return latinRatio > 0.2 ? 'HI-EN' : 'HI';
  }

  // Check for Hinglish markers in Latin script
  const words = text.toLowerCase().split(/\s+/);
  const hinglishCount = words.filter((w) => HINGLISH_MARKERS.has(w)).length;
  const hinglishRatio = hinglishCount / Math.max(words.length, 1);

  if (hinglishRatio >= 0.15) return 'HI-EN';
  return 'EN';
}
