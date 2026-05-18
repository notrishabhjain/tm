import { runRuleEngine } from '../../src/domain/extraction/ruleEngine';
import type { KeywordEntry } from '../../src/domain/extraction/ruleEngine';

const SEED_KEYWORDS: KeywordEntry[] = [
  { phrase: 'send', category: 'IMPERATIVE', language: 'en', weight: 1.0 },
  { phrase: 'please send', category: 'IMPERATIVE', language: 'en', weight: 1.0 },
  { phrase: 'urgent', category: 'URGENCY', language: 'en', weight: 1.0 },
  { phrase: 'today', category: 'DEADLINE', language: 'en', weight: 1.0 },
  { phrase: 'lol', category: 'ANTI_PATTERN', language: 'en', weight: 1.0 },
  { phrase: 'thanks', category: 'ANTI_PATTERN', language: 'en', weight: 0.8 },
  { phrase: 'karna hai', category: 'IMPERATIVE', language: 'hi-en', weight: 1.0 },
  { phrase: 'kal tak', category: 'DEADLINE', language: 'hi-en', weight: 1.0 },
];

describe('runRuleEngine', () => {
  it('scores high for imperative + urgency + deadline', () => {
    const r = runRuleEngine('urgent please send the report today', 7, SEED_KEYWORDS);
    expect(r.score).toBeGreaterThan(0.7);
    expect(r.hasImperative).toBe(true);
    expect(r.hasUrgency).toBe(true);
    expect(r.hasDeadline).toBe(true);
  });

  it('scores low for pure anti-pattern (no imperative)', () => {
    const r = runRuleEngine('lol thanks', 2, SEED_KEYWORDS);
    expect(r.score).toBeLessThan(0.3);
    expect(r.hasAntiPattern).toBe(true);
    expect(r.hasImperative).toBe(false);
  });

  it('scores medium for imperative alone', () => {
    const r = runRuleEngine('please send the document now', 5, SEED_KEYWORDS);
    expect(r.score).toBeGreaterThan(0.4);
    expect(r.hasImperative).toBe(true);
  });

  it('returns zero for empty text', () => {
    const r = runRuleEngine('', 0, SEED_KEYWORDS);
    expect(r.score).toBe(0);
    expect(r.matchedKeywords).toHaveLength(0);
  });

  it('handles Hinglish keywords', () => {
    const r = runRuleEngine('kal tak report karna hai', 4, SEED_KEYWORDS);
    expect(r.hasImperative).toBe(true);
    expect(r.hasDeadline).toBe(true);
  });

  it('matches multi-word phrases', () => {
    const r = runRuleEngine('please send me the file', 5, SEED_KEYWORDS);
    const matched = r.matchedKeywords.map((k) => k.phrase);
    expect(matched).toContain('please send');
  });

  it('clamps score to [0, 1]', () => {
    const r = runRuleEngine('urgent please send today you', 5, SEED_KEYWORDS);
    expect(r.score).toBeGreaterThanOrEqual(0);
    expect(r.score).toBeLessThanOrEqual(1);
  });
});
