const SENTENCE_END = /[.!?।\n]/;

export function extractTaskText(rawSourceText: string): string {
  const parts = rawSourceText.split(SENTENCE_END);
  const firstMeaningful = parts.find((p) => p.trim().length > 10);

  if (firstMeaningful) {
    const trimmed = firstMeaningful.trim();
    return trimmed.length <= 120 ? trimmed : `${trimmed.slice(0, 117)}...`;
  }

  return rawSourceText.length <= 120 ? rawSourceText : `${rawSourceText.slice(0, 117)}...`;
}
