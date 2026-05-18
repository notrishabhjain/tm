import { aggregateConfidence } from '../../../src/domain/extraction/confidenceAggregator';

describe('aggregateConfidence', () => {
  it('returns CREATE for score >= 0.75', () => {
    const result = aggregateConfidence({
      ruleScore: 0.8,
      modelScore: null,
      ruleWeight: 1.0,
      modelWeight: 0.0,
      isVipSender: false,
    });
    expect(result.decision).toBe('CREATE');
    expect(result.finalConfidence).toBeCloseTo(0.8);
  });

  it('returns CONFIRM for score 0.40-0.74', () => {
    const result = aggregateConfidence({
      ruleScore: 0.55,
      modelScore: null,
      ruleWeight: 1.0,
      modelWeight: 0.0,
      isVipSender: false,
    });
    expect(result.decision).toBe('CONFIRM');
  });

  it('returns DISCARD for score < 0.40', () => {
    const result = aggregateConfidence({
      ruleScore: 0.2,
      modelScore: null,
      ruleWeight: 1.0,
      modelWeight: 0.0,
      isVipSender: false,
    });
    expect(result.decision).toBe('DISCARD');
  });

  it('combines rule and model scores with weights', () => {
    const result = aggregateConfidence({
      ruleScore: 0.6,
      modelScore: 0.9,
      ruleWeight: 0.5,
      modelWeight: 0.5,
      isVipSender: false,
    });
    expect(result.finalConfidence).toBeCloseTo(0.75);
    expect(result.decision).toBe('CREATE');
  });

  it('VIP sender creates task with lower threshold (>=0.30)', () => {
    const result = aggregateConfidence({
      ruleScore: 0.35,
      modelScore: null,
      ruleWeight: 1.0,
      modelWeight: 0.0,
      isVipSender: true,
    });
    expect(result.decision).toBe('CREATE');
  });

  it('VIP sender with very low score still discards', () => {
    const result = aggregateConfidence({
      ruleScore: 0.1,
      modelScore: null,
      ruleWeight: 1.0,
      modelWeight: 0.0,
      isVipSender: true,
    });
    expect(result.decision).toBe('DISCARD');
  });

  it('clamps score to 0-1 range', () => {
    const result = aggregateConfidence({
      ruleScore: 1.5,
      modelScore: null,
      ruleWeight: 1.0,
      modelWeight: 0.0,
      isVipSender: false,
    });
    expect(result.finalConfidence).toBeLessThanOrEqual(1.0);
  });
});
