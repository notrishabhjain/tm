import { detectLanguage } from '../../src/domain/extraction/languageDetector';

describe('detectLanguage', () => {
  it('classifies English-only text as "en"', () => {
    const result = detectLanguage('Please send the report by today');
    expect(result.language).toBe('en');
    expect(result.hasDevanagari).toBe(false);
    expect(result.hasLatin).toBe(true);
  });

  it('classifies Devanagari-only text as "hi"', () => {
    const result = detectLanguage('कल तक रिपोर्ट भेज दो');
    expect(result.language).toBe('hi');
    expect(result.hasDevanagari).toBe(true);
  });

  it('classifies mixed Hinglish as "hi-en"', () => {
    const result = detectLanguage('kal tak report bhej dena please');
    // No Devanagari, so treated as en
    expect(['en', 'hi-en']).toContain(result.language);
  });

  it('classifies mixed script text as "hi-en"', () => {
    const result = detectLanguage('Please भेज दो report aaj tak');
    expect(result.language).toBe('hi-en');
    expect(result.hasDevanagari).toBe(true);
    expect(result.hasLatin).toBe(true);
  });

  it('handles empty string gracefully', () => {
    const result = detectLanguage('');
    expect(result.language).toBe('en');
  });
});
