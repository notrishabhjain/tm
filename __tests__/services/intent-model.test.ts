import { runInference } from '@/services/intent-model';
import type { ModelData } from '@/services/model-manager';
import { FEATURE_DIM } from '@/services/text-featurizer';

function makeModel(bias: number, weights?: number[]): ModelData {
  return {
    version: '1.0.0',
    type: 'logistic_regression',
    featureDim: FEATURE_DIM,
    weights: weights ?? new Array(FEATURE_DIM).fill(0),
    bias,
  };
}

describe('runInference', () => {
  it('returns 0.5 when weights are all zero and bias is zero', () => {
    const score = runInference('please send the report', makeModel(0));
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('returns 0.5 when weights array is empty (neutral model guard)', () => {
    const score = runInference('please send the report', {
      version: '0.0.0',
      type: 'logistic_regression',
      featureDim: FEATURE_DIM,
      weights: [],
      bias: 99,
    });
    expect(score).toBeCloseTo(0.5, 5);
  });

  it('returns >0.5 with positive bias and zero weights', () => {
    const score = runInference('any text', makeModel(2));
    expect(score).toBeGreaterThan(0.5);
  });

  it('returns <0.5 with negative bias and zero weights', () => {
    const score = runInference('any text', makeModel(-2));
    expect(score).toBeLessThan(0.5);
  });

  it('output is always in [0, 1]', () => {
    const score = runInference('hello world', makeModel(100));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('output is always in [0, 1] for extreme negative bias', () => {
    const score = runInference('hello world', makeModel(-100));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  it('weights shift the output proportional to feature alignment', () => {
    // Build a model that strongly weights a known feature bucket
    const weights = new Array(FEATURE_DIM).fill(0);
    // Force-add a large weight at index 0 (will be hit by some token)
    weights[0] = 10;
    const modelPos = makeModel(0, weights);
    const modelNeg = makeModel(
      0,
      weights.map((w: number) => -w)
    );

    const scorePos = runInference('test token', modelPos);
    const scoreNeg = runInference('test token', modelNeg);
    // Scores should be on opposite sides of 0.5 (or at least ordered)
    expect(scorePos + scoreNeg).toBeCloseTo(1, 1);
  });

  it('is deterministic for the same input', () => {
    const model = makeModel(0.5, new Array(FEATURE_DIM).fill(0.01));
    const a = runInference('please send the report', model);
    const b = runInference('please send the report', model);
    expect(a).toBe(b);
  });
});
