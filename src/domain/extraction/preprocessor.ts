export interface PreprocessedText {
  normalized: string;
  original: string;
  wordCount: number;
}

const EMOJI_REGEX =
  /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;

// Common noise patterns in messaging app notifications
const NOISE_PATTERNS = [
  // Media attachments (no actionable text)
  /^(photo|video|audio|document|sticker|gif|voice message|voice note|location|contact|reaction)$/i,
  // Aggregate notification summaries
  /^\d+\s+messages?\s+from\s+\d+\s+chats?$/i,
  /^\d+\s+new\s+messages?$/i,
  /^\d+\s+unread\s+messages?$/i,
  /^\d+\s+notifications?$/i,
  /^\d+\s+missed\s+(calls?|messages?)$/i,
  // Sync / status indicators
  /^sync(ing)?(\s+for\s+new\s+messages?)?\.{0,3}$/i,
  /^(downloading|uploading|backup|restoring|connecting|reconnecting)(\s+.*)?$/i,
  /^end.to.end\s+encrypted$/i,
  // Delivery / read receipts
  /^(delivered|read|sent|seen|pending)$/i,
  // Presence / status
  /^(online|offline|away|busy|last seen .+)$/i,
  /^typing\.{0,3}$/i,
  // Call noise (missed call is actionable, but raw status lines are not)
  /^(incoming|outgoing|ongoing)\s+(voice|video)?\s*call$/i,
  // App-level status lines
  /^(tap to|swipe to)\s+(view|open|reply|dismiss).*$/i,
  /^(pull down to refresh|no new notifications?|all caught up)$/i,
  /^(\d+\s+)?new\s+(email|message|notification)s?$/i,
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
