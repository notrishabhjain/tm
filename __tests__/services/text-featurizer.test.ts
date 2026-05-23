import { featurize, tokenize, FEATURE_DIM } from '@/services/text-featurizer';

describe('tokenize', () => {
  it('lowercases and splits on whitespace', () => {
    expect(tokenize('Hello World')).toEqual(['hello', 'world']);
  });

  it('strips punctuation', () => {
    expect(tokenize('send report!!')).toEqual(['send', 'report']);
  });

  it('filters single-char tokens', () => {
    expect(tokenize('a b cc')).toEqual(['cc']);
  });

  it('keeps Devanagari tokens', () => {
    const tokens = tokenize('report भेजो');
    expect(tokens).toContain('report');
    expect(tokens).toContain('भेजो');
  });

  it('returns empty array for whitespace-only input', () => {
    expect(tokenize('   ')).toEqual([]);
  });
});

describe('featurize', () => {
  it('returns a Float32Array of FEATURE_DIM length', () => {
    const feat = featurize('Please send the report');
    expect(feat).toBeInstanceOf(Float32Array);
    expect(feat.length).toBe(FEATURE_DIM);
  });

  it('is L2-normalized (norm ≈ 1)', () => {
    const feat = featurize('Please send the report by EOD');
    let norm = 0;
    for (let i = 0; i < feat.length; i++) norm += feat[i] * feat[i];
    expect(Math.sqrt(norm)).toBeCloseTo(1, 5);
  });

  it('produces non-zero features for non-empty text', () => {
    const feat = featurize('submit the invoice');
    const nonZero = Array.from(feat).filter((v) => v !== 0).length;
    expect(nonZero).toBeGreaterThan(0);
  });

  it('produces all-zero features for empty text', () => {
    const feat = featurize('');
    const nonZero = Array.from(feat).filter((v) => v !== 0).length;
    expect(nonZero).toBe(0);
  });

  it('produces the same output for the same input (deterministic)', () => {
    const a = featurize('Please review the document');
    const b = featurize('Please review the document');
    for (let i = 0; i < FEATURE_DIM; i++) {
      expect(a[i]).toBe(b[i]);
    }
  });

  it('produces different outputs for different inputs', () => {
    const a = featurize('Please send the report');
    const b = featurize('Your order has been delivered');
    let identical = true;
    for (let i = 0; i < FEATURE_DIM; i++) {
      if (a[i] !== b[i]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(false);
  });

  it('includes bigram features (two texts with same unigrams but different order differ)', () => {
    const a = featurize('please send report');
    const b = featurize('send please report');
    let identical = true;
    for (let i = 0; i < FEATURE_DIM; i++) {
      if (a[i] !== b[i]) {
        identical = false;
        break;
      }
    }
    expect(identical).toBe(false);
  });
});
