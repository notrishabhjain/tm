import { detectLanguage } from '../../../src/domain/extraction/languageDetector';

describe('detectLanguage', () => {
  it('detects English text', () => {
    expect(detectLanguage('Please send the report by tomorrow')).toBe('EN');
  });

  it('detects Devanagari Hindi', () => {
    expect(detectLanguage('कल तक रिपोर्ट भेज दो')).toBe('HI');
  });

  it('detects Hinglish (Latin script)', () => {
    expect(detectLanguage('kal tak report bhej dena please')).toBe('HI-EN');
  });

  it('detects mixed Devanagari and Latin as HI-EN', () => {
    expect(detectLanguage('kal tak report भेज दो please')).toBe('HI-EN');
  });

  it('returns EN for empty string', () => {
    expect(detectLanguage('')).toBe('EN');
  });

  it('returns EN for numbers and symbols only', () => {
    expect(detectLanguage('12345 !!!')).toBe('EN');
  });

  it('detects short Hinglish phrases', () => {
    expect(detectLanguage('aaj karo yaar')).toBe('HI-EN');
  });
});
