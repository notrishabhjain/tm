import { combineNotificationFields, preprocess } from '../../src/domain/extraction/preprocessor';

describe('preprocess', () => {
  it('lowercases Latin text', () => {
    const r = preprocess('PLEASE SEND THE REPORT');
    expect(r.normalized).toBe('please send the report');
  });

  it('preserves original text', () => {
    const r = preprocess('Send Report NOW');
    expect(r.original).toBe('Send Report NOW');
  });

  it('collapses whitespace', () => {
    const r = preprocess('  hello   world  ');
    expect(r.normalized).toBe('hello world');
  });

  it('counts words correctly', () => {
    const r = preprocess('please send the report by today');
    expect(r.wordCount).toBe(6);
  });

  it('returns 0 word count for empty string', () => {
    const r = preprocess('');
    expect(r.wordCount).toBe(0);
  });

  it('NFC-normalizes Unicode', () => {
    // Both forms should normalize to the same string
    const r1 = preprocess('\u00e9'); // precomposed é
    const r2 = preprocess('e\u0301'); // decomposed e + combining accent
    expect(r1.normalized).toBe(r2.normalized);
  });
});

describe('combineNotificationFields', () => {
  it('prefers bigText over text', () => {
    const r = combineNotificationFields('Title', 'Short', 'Long body text here');
    expect(r).toBe('Title Long body text here');
  });

  it('falls back to text when bigText is empty', () => {
    const r = combineNotificationFields('Title', 'Short text', '');
    expect(r).toBe('Title Short text');
  });

  it('handles all empty fields', () => {
    const r = combineNotificationFields('', '', '');
    expect(r).toBe('');
  });
});
