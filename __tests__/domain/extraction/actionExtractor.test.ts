import { extractTaskText } from '../../../src/domain/extraction/actionExtractor';

describe('extractTaskText', () => {
  // ── Backward-compatible baseline cases ───────────────────────────────────
  it('returns first meaningful sentence (≤120 chars)', () => {
    const result = extractTaskText('Please send the report. Thanks.');
    expect(result).toBe('Please send the report');
  });

  it('truncates a long first sentence to 120 chars', () => {
    const long = 'a'.repeat(130);
    const result = extractTaskText(long);
    expect(result).toBe(`${'a'.repeat(117)}...`);
  });

  it('falls back to raw text when no segment passes the length filter', () => {
    const result = extractTaskText('ok.yes.no');
    expect(result).toBe('ok.yes.no');
  });

  it('truncates raw fallback text when it exceeds 120 chars', () => {
    const result = extractTaskText(`ok.${'b'.repeat(130)}`);
    expect(result).toBe(`${'b'.repeat(117)}...`);
  });

  // ── UI chrome filtering ───────────────────────────────────────────────────
  it('filters known app names from OCR output', () => {
    const ocrDump = 'WhatsApp\nRahul\nCan you review the report by end of day?\nSeen';
    // The '?' is the split delimiter so it's stripped; remaining text is the title
    expect(extractTaskText(ocrDump)).toBe('Can you review the report by end of day');
  });

  it('filters timestamp lines', () => {
    const text = '2:30 PM\nCall me when you are free please';
    expect(extractTaskText(text)).toBe('Call me when you are free please');
  });

  it('filters relative time strings', () => {
    const text = '5 mins ago\nPlease confirm your attendance';
    expect(extractTaskText(text)).toBe('Please confirm your attendance');
  });

  it('filters tab labels like Chats, Status, Calls', () => {
    const text = 'Chats\nStatus\nCalls\nHey can you call me back asap';
    expect(extractTaskText(text)).toBe('Hey can you call me back asap');
  });

  // ── Action-keyword preference ─────────────────────────────────────────────
  it('prefers a line with an action keyword over a plain line', () => {
    const text = 'Hello there friend\nPlease send me the document ASAP';
    expect(extractTaskText(text)).toBe('Please send me the document ASAP');
  });

  it('picks the urgent-flagged line even when it appears later', () => {
    const text = 'Good morning everyone\nReminder: review the contract by end of day';
    expect(extractTaskText(text)).toBe('Reminder: review the contract by end of day');
  });

  it('falls back to longest line when no action keyword present', () => {
    const text = 'Hi\nThis is a fairly long sentence without special keywords here';
    expect(extractTaskText(text)).toBe(
      'This is a fairly long sentence without special keywords here'
    );
  });

  // ── Edge cases ────────────────────────────────────────────────────────────
  it('returns empty string for empty input', () => {
    expect(extractTaskText('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(extractTaskText('   \n  \t  ')).toBe('');
  });

  it('handles Hindi action keywords', () => {
    const text = 'Rishi\nZaroor bhej dena report aaj tak';
    expect(extractTaskText(text)).toBe('Zaroor bhej dena report aaj tak');
  });
});
