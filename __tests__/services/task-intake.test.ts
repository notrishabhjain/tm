import { normaliseTitle, titleKeyOf, normaliseDueDate } from '../../src/services/task-intake';

describe('normaliseTitle', () => {
  it('collapses whitespace and trims', () => {
    expect(normaliseTitle('  send   the\n\ndeck  ')).toBe('send the deck');
  });

  it('strips wrapping quotes the model likes to add', () => {
    expect(normaliseTitle('"Pay Sharma Ji ₹25,000"')).toBe('Pay Sharma Ji ₹25,000');
    expect(normaliseTitle('“Share the Q2 report”')).toBe('Share the Q2 report');
  });

  it('truncates over-long titles without cutting mid-word', () => {
    const long = ('Send ' + 'the quarterly revenue report '.repeat(10)).replace(/\s+/g, ' ').trim();
    const out = normaliseTitle(long);

    expect(out.length).toBeLessThanOrEqual(121);
    expect(out.endsWith('…')).toBe(true);

    // The real invariant: what survives is a prefix of the original that ends
    // on a word boundary, so no word is left half-written.
    const kept = out.slice(0, -1);
    expect(long.startsWith(kept)).toBe(true);
    const nextChar = long.charAt(kept.length);
    expect(nextChar === '' || nextChar === ' ').toBe(true);
  });

  it('preserves Devanagari content', () => {
    expect(normaliseTitle('  कल पेमेंट कर देना  ')).toBe('कल पेमेंट कर देना');
  });
});

describe('titleKeyOf — deduplication', () => {
  it('ignores case and punctuation', () => {
    expect(titleKeyOf('Send the deck!')).toBe(titleKeyOf('send the DECK'));
  });

  it('ignores politeness so re-phrasings collapse to one task', () => {
    expect(titleKeyOf('Please send the invoice')).toBe(titleKeyOf('Send the invoice'));
    expect(titleKeyOf('Kindly send the invoice')).toBe(titleKeyOf('send the invoice'));
  });

  it('strips stacked filler prefixes', () => {
    expect(titleKeyOf('please kindly send the file')).toBe(titleKeyOf('send the file'));
  });

  it('keeps genuinely different tasks distinct', () => {
    expect(titleKeyOf('Send the invoice')).not.toBe(titleKeyOf('Send the report'));
  });

  it('does not destroy Devanagari titles', () => {
    expect(titleKeyOf('कल पेमेंट कर देना')).toBe('कल पेमेंट कर देना');
  });

  it('returns empty for a punctuation-only title so intake can reject it', () => {
    expect(titleKeyOf('!!! ???')).toBe('');
  });
});

describe('normaliseDueDate', () => {
  const now = Date.UTC(2026, 6, 1, 12, 0, 0);

  it('accepts a near-future deadline', () => {
    const due = now + 3 * 60 * 60 * 1000;
    expect(normaliseDueDate(due, now)).toBe(due);
  });

  it('keeps a deadline that has only just passed — that is a real overdue task', () => {
    const due = now - 2 * 60 * 60 * 1000;
    expect(normaliseDueDate(due, now)).toBe(due);
  });

  it('rejects a deadline resolved far into the past as a resolution error', () => {
    expect(normaliseDueDate(now - 5 * 24 * 60 * 60 * 1000, now)).toBeNull();
  });

  it('rejects absurd far-future dates', () => {
    expect(normaliseDueDate(now + 10 * 365 * 24 * 60 * 60 * 1000, now)).toBeNull();
  });

  it('rejects seconds-precision timestamps mistaken for milliseconds', () => {
    expect(normaliseDueDate(Math.floor(now / 1000), now)).toBeNull();
  });

  it('rejects non-finite and non-numeric values', () => {
    expect(normaliseDueDate(NaN, now)).toBeNull();
    expect(normaliseDueDate(Infinity, now)).toBeNull();
    expect(normaliseDueDate('tomorrow', now)).toBeNull();
    expect(normaliseDueDate(null, now)).toBeNull();
    expect(normaliseDueDate(undefined, now)).toBeNull();
  });
});
