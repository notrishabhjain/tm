import { preprocessText, isNoise } from '../../../src/domain/extraction/preprocessor';

describe('preprocessText', () => {
  it('lowercases and trims text', () => {
    const result = preprocessText('  Hello World  ');
    expect(result.normalized).toBe('hello world');
    expect(result.original).toBe('  Hello World  ');
  });

  it('counts words correctly', () => {
    const result = preprocessText('send me the file');
    expect(result.wordCount).toBe(4);
  });

  it('strips emoji characters', () => {
    const result = preprocessText('Send 😀 the file');
    expect(result.normalized).not.toContain('😀');
  });

  it('collapses multiple spaces', () => {
    const result = preprocessText('hello   world');
    expect(result.normalized).toBe('hello world');
  });
});

describe('isNoise', () => {
  it('returns true for text shorter than 4 chars', () => {
    expect(isNoise('ok')).toBe(true);
    expect(isNoise('hi')).toBe(true);
    expect(isNoise('')).toBe(true);
  });

  it('returns true for media attachment noise', () => {
    expect(isNoise('photo')).toBe(true);
    expect(isNoise('video')).toBe(true);
    expect(isNoise('sticker')).toBe(true);
    expect(isNoise('voice message')).toBe(true);
  });

  it('returns true for typing indicator', () => {
    expect(isNoise('typing...')).toBe(true);
  });

  it('returns true for status strings', () => {
    expect(isNoise('online')).toBe(true);
    expect(isNoise('delivered')).toBe(true);
    expect(isNoise('read')).toBe(true);
  });

  it('returns false for actionable text', () => {
    expect(isNoise('Please send me the report by tomorrow')).toBe(false);
  });

  it('returns false for non-noise text above threshold', () => {
    expect(isNoise('Call me back soon')).toBe(false);
  });
});
