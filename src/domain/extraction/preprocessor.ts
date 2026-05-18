export interface PreprocessedText {
  normalized: string;
  original: string;
  wordCount: number;
}

const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

// Common noise patterns in messaging app notifications
const NOISE_PATTERNS = [
  /^(photo|video|audio|document|sticker|gif|voice message|location)$/i,
  /^\d+ messages? from \d+ chats?$/i,
  /^typing\.{3}$/i,
  /^online$/i,
  /^(delivered|read|sent)$/i,
];

export function preprocessText(text: string): PreprocessedText {
  const original = text;

  const normalized = text
    .replace(EMOJI_REGEX, ' ')
    .replace(/[^\w\sऀ-ॿ.,!?:;'"()-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  return {
    normalized,
    original,
    wordCount: normalized.split(/\s+/).filter(Boolean).length,
  };
}

export function isNoise(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length < 4) return true;
  return NOISE_PATTERNS.some((p) => p.test(trimmed));
}
