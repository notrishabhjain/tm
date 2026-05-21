import { SEED_VOCABULARY, DEFAULT_PIPELINE_CONFIG } from '@/domain/extraction/seedConfig';

describe('seedConfig', () => {
  describe('SEED_VOCABULARY', () => {
    it('is a non-empty array', () => {
      expect(Array.isArray(SEED_VOCABULARY)).toBe(true);
      expect(SEED_VOCABULARY.length).toBeGreaterThan(0);
    });

    it('each keyword has required fields', () => {
      for (const kw of SEED_VOCABULARY) {
        expect(typeof kw.phrase).toBe('string');
        expect(kw.phrase.length).toBeGreaterThan(0);
        expect(['URGENCY', 'IMPERATIVE', 'ANTI_PATTERN']).toContain(kw.category);
        expect(['EN', 'HI', 'HI-EN']).toContain(kw.language);
        expect(typeof kw.weight).toBe('number');
        expect(kw.weight).toBeGreaterThan(0);
      }
    });

    it('maps URGENT priority_hint to URGENCY category with weight 1.5', () => {
      const urgent = SEED_VOCABULARY.filter((k) => k.category === 'URGENCY');
      expect(urgent.length).toBeGreaterThan(0);
      for (const kw of urgent) {
        expect(kw.weight).toBe(1.5);
      }
    });

    it('maps HIGH priority_hint to IMPERATIVE category with weight 1.2', () => {
      const high = SEED_VOCABULARY.filter((k) => k.weight === 1.2);
      expect(high.length).toBeGreaterThan(0);
      for (const kw of high) {
        expect(kw.category).toBe('IMPERATIVE');
      }
    });

    it('maps MEDIUM/LOW priority_hint to weight 1.0', () => {
      const medium = SEED_VOCABULARY.filter((k) => k.weight === 1.0);
      expect(medium.length).toBeGreaterThan(0);
    });
  });

  describe('DEFAULT_PIPELINE_CONFIG', () => {
    it('has empty vipSenders', () => {
      expect(DEFAULT_PIPELINE_CONFIG.vipSenders).toEqual([]);
    });

    it('uses rule-only mode (modelWeight 0)', () => {
      expect(DEFAULT_PIPELINE_CONFIG.ruleWeight).toBe(1.0);
      expect(DEFAULT_PIPELINE_CONFIG.modelWeight).toBe(0.0);
    });

    it('vocabulary matches SEED_VOCABULARY', () => {
      expect(DEFAULT_PIPELINE_CONFIG.vocabulary).toBe(SEED_VOCABULARY);
    });
  });
});
