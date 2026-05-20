import { runRuleEngine, type Keyword } from '../../../src/domain/extraction/ruleEngine';

const VOCAB: Keyword[] = [
  { phrase: 'send', category: 'IMPERATIVE', language: 'EN', weight: 1.0 },
  { phrase: 'urgent', category: 'URGENCY', language: 'EN', weight: 1.5 },
  { phrase: 'by tomorrow', category: 'DEADLINE', language: 'EN', weight: 1.0 },
  { phrase: 'lol', category: 'ANTI_PATTERN', language: 'EN', weight: 1.0 },
  { phrase: 'bhej', category: 'IMPERATIVE', language: 'HI-EN', weight: 1.0 },
  { phrase: 'kal tak', category: 'DEADLINE', language: 'HI-EN', weight: 1.0 },
];

describe('runRuleEngine', () => {
  it('matches imperative keyword', () => {
    const result = runRuleEngine('please send the file', 4, VOCAB);
    expect(result.hasImperative).toBe(true);
    expect(result.matches.some((m) => m.phrase === 'send')).toBe(true);
  });

  it('matches urgency keyword', () => {
    const result = runRuleEngine('this is urgent please respond', 5, VOCAB);
    expect(result.hasUrgency).toBe(true);
  });

  it('matches deadline', () => {
    const result = runRuleEngine('finish the report by tomorrow', 5, VOCAB);
    expect(result.hasDeadline).toBe(true);
  });

  it('detects anti-pattern', () => {
    const result = runRuleEngine('lol that was funny', 4, VOCAB);
    expect(result.hasAntiPattern).toBe(true);
  });

  it('penalizes anti-pattern without imperative', () => {
    const result = runRuleEngine('lol', 1, VOCAB);
    // anti-pattern(-0.25) + short(<3 words, -0.1) = -0.35 → clamped to 0
    expect(result.score).toBe(0);
  });

  it('gives high score for imperative + deadline + pronoun', () => {
    const result = runRuleEngine('can you send the report by tomorrow please', 8, VOCAB);
    expect(result.score).toBeGreaterThan(0.6);
  });

  it('handles Hinglish keywords', () => {
    const result = runRuleEngine('kal tak report bhej dena', 5, VOCAB);
    expect(result.hasImperative).toBe(true);
    expect(result.hasDeadline).toBe(true);
  });

  it('penalizes very short text', () => {
    const result = runRuleEngine('ok', 1, VOCAB);
    expect(result.score).toBeLessThan(0.3);
  });

  it('returns score between 0 and 1', () => {
    const texts = [
      'send report urgent by tomorrow please you',
      'lol ok haha',
      'kal tak bhej dena urgent please review this document carefully',
    ];
    for (const text of texts) {
      const result = runRuleEngine(text, text.split(' ').length, VOCAB);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
    }
  });
});
