/**
 * Stage 6: Extract a concise task text from the notification body.
 *
 * Strategy:
 * 1. Find the first IMPERATIVE keyword in the normalized text.
 * 2. Extract from that keyword to the next sentence terminator.
 * 3. If no imperative found, use the first sentence of the text.
 * 4. Fallback: return the first 100 characters of the original.
 */
export function extractAction(
  normalizedText: string,
  originalText: string,
  imperativeKeywords: string[],
): string {
  // Try to find an imperative keyword and extract from there
  for (const kw of imperativeKeywords) {
    const idx = normalizedText.indexOf(kw);
    if (idx === -1) continue;

    // Take from index to next sentence boundary
    const fromKw = originalText.slice(idx);
    const sentenceEnd = fromKw.search(/[.!?।\n]/);
    const extracted =
      sentenceEnd > 0 ? fromKw.slice(0, sentenceEnd) : fromKw.slice(0, 120);

    const trimmed = extracted.trim();
    if (trimmed.length >= 5) return trimmed;
  }

  // Fallback: first sentence of original
  const firstSentence = originalText.split(/[.!?।\n]/)[0]?.trim() ?? '';
  if (firstSentence.length >= 5) return firstSentence;

  // Last resort: first 100 chars
  return originalText.slice(0, 100).trim();
}
