import type { MatchedKeyword, RuleEngineResult } from './types';
import { KeywordCategory } from './types';

export interface KeywordEntry {
  phrase: string;
  category: KeywordCategory;
  language: string;
  weight: number;
}

/**
 * Stage 3: Rule-based keyword matching engine.
 *
 * Confidence scoring per SRS FR-EX-06:
 *   +0.40 if IMPERATIVE matched
 *   +0.20 if URGENCY matched
 *   +0.15 if DEADLINE matched
 *   +0.15 if 2nd-person pronoun present
 *   +0.10 if wordCount in [5, 40]
 *   -0.30 if ANTI_PATTERN matched AND no IMPERATIVE
 *   -0.20 if wordCount < 3
 *   = clamp(score, 0.0, 1.0)
 */
export function runRuleEngine(
  normalizedText: string,
  wordCount: number,
  keywords: KeywordEntry[],
): RuleEngineResult {
  const matched: MatchedKeyword[] = [];

  for (const kw of keywords) {
    if (matchesPhrase(normalizedText, kw.phrase)) {
      matched.push({
        phrase: kw.phrase,
        category: kw.category as KeywordCategory,
        language: kw.language as import('../entities/Task').Language,
        weight: kw.weight,
      });
    }
  }

  const hasImperative = matched.some((m) => m.category === KeywordCategory.IMPERATIVE);
  const hasUrgency = matched.some((m) => m.category === KeywordCategory.URGENCY);
  const hasDeadline = matched.some((m) => m.category === KeywordCategory.DEADLINE);
  const hasAntiPattern = matched.some((m) => m.category === KeywordCategory.ANTI_PATTERN);

  const has2ndPerson = HAS_2ND_PERSON.test(normalizedText);

  let score = 0.0;
  if (hasImperative) score += 0.40;
  if (hasUrgency) score += 0.20;
  if (hasDeadline) score += 0.15;
  if (has2ndPerson) score += 0.15;
  if (wordCount >= 5 && wordCount <= 40) score += 0.10;
  if (hasAntiPattern && !hasImperative) score -= 0.30;
  if (wordCount < 3) score -= 0.20;

  return {
    score: Math.max(0.0, Math.min(1.0, score)),
    matchedKeywords: matched,
    hasImperative,
    hasUrgency,
    hasDeadline,
    hasAntiPattern,
  };
}

/** Match a phrase against text. Word-boundary aware for Latin, substring for Devanagari. */
function matchesPhrase(text: string, phrase: string): boolean {
  if (!phrase || !text) return false;
  const hasDevanagari = /[\u0900-\u097F]/.test(phrase);
  if (hasDevanagari) {
    return text.includes(phrase);
  }
  // Word boundary match for Latin phrases
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|\\s|[^a-z])${escaped}(?:$|\\s|[^a-z])`, 'i');
  return re.test(text);
}

const HAS_2ND_PERSON = /\b(you|your|tum|tumhara|aap|aapka|apna|apke)\b/i;
