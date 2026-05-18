import type { Language } from '../types';

export type KeywordCategory =
  | 'IMPERATIVE'
  | 'URGENCY'
  | 'DEADLINE'
  | 'REQUEST'
  | 'ANTI_PATTERN'
  | 'DOMAIN';

export interface Keyword {
  phrase: string;
  category: KeywordCategory;
  language: Language | 'en';
  weight: number;
}

export interface KeywordMatch {
  phrase: string;
  category: KeywordCategory;
  weight: number;
}

export interface RuleEngineResult {
  score: number;
  matches: KeywordMatch[];
  hasImperative: boolean;
  hasUrgency: boolean;
  hasDeadline: boolean;
  hasAntiPattern: boolean;
  urgencyWeight: number;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function runRuleEngine(
  normalized: string,
  wordCount: number,
  vocabulary: Keyword[]
): RuleEngineResult {
  const matches: KeywordMatch[] = [];
  let hasImperative = false;
  let hasUrgency = false;
  let hasDeadline = false;
  let hasAntiPattern = false;
  let urgencyWeight = 0;

  for (const entry of vocabulary) {
    const isLatinPhrase = /[a-zA-Z]/.test(entry.phrase);
    const pattern = isLatinPhrase
      ? new RegExp(`\\b${escapeRegex(entry.phrase)}\\b`, 'i')
      : new RegExp(escapeRegex(entry.phrase));

    if (pattern.test(normalized)) {
      matches.push({ phrase: entry.phrase, category: entry.category, weight: entry.weight });
      if (entry.category === 'IMPERATIVE') hasImperative = true;
      if (entry.category === 'URGENCY') {
        hasUrgency = true;
        urgencyWeight = Math.max(urgencyWeight, entry.weight);
      }
      if (entry.category === 'DEADLINE') hasDeadline = true;
      if (entry.category === 'ANTI_PATTERN') hasAntiPattern = true;
    }
  }

  const hasTwoPronoun = /\b(you|your|tumhara|tumhe|aap)\b/i.test(normalized);

  let score = 0;
  if (hasImperative) score += 0.4;
  if (hasUrgency) score += 0.2;
  if (hasDeadline) score += 0.15;
  if (hasTwoPronoun) score += 0.15;
  if (wordCount >= 5 && wordCount <= 40) score += 0.1;
  if (hasAntiPattern && !hasImperative) score -= 0.3;
  if (wordCount < 3) score -= 0.2;

  score = Math.max(0, Math.min(1, score));

  return { score, matches, hasImperative, hasUrgency, hasDeadline, hasAntiPattern, urgencyWeight };
}
