// Common app names and navigation tab labels that appear in OCR dumps of messaging apps.
const UI_CHROME = new Set([
  'whatsapp',
  'telegram',
  'instagram',
  'facebook',
  'twitter',
  'gmail',
  'messages',
  'chats',
  'status',
  'calls',
  'search',
  'camera',
  'notifications',
  'settings',
  'inbox',
]);

const TIMESTAMP_RE = /^\d{1,2}:\d{2}(\s*(am|pm))?$/i;
const RELATIVE_TIME_RE =
  /^(today|yesterday|just now|online|typing\.?\.?\.?|\d+\s+(min|mins|minute|minutes|hour|hours|day|days|week|weeks)\s+ago)$/i;

function isUiLine(line: string): boolean {
  const l = line.toLowerCase();
  if (TIMESTAMP_RE.test(l)) return true;
  if (RELATIVE_TIME_RE.test(l)) return true;
  if (UI_CHROME.has(l)) return true;
  return false;
}

// Phrases that suggest an action is being requested.
const ACTION_RE =
  /\b(send|call|check|confirm|review|submit|share|update|provide|forward|schedule|book|complete|finish|sign|approve|prepare|please|let me know|by tomorrow|by end of day|asap|urgent|can you|need to|have to|must|bhej|kar|dekh|bata|zaroor)\b/i;

export function extractTaskText(rawSourceText: string): string {
  if (!rawSourceText.trim()) return '';

  // Split on sentence/line endings; filter out UI chrome and very short fragments.
  const lines = rawSourceText
    .split(/[.!?।\n]/)
    .map((l) => l.trim())
    .filter((l) => l.length > 4 && !isUiLine(l));

  if (lines.length === 0) {
    const raw = rawSourceText.trim();
    return raw.length <= 120 ? raw : `${raw.slice(0, 117)}...`;
  }

  // Prefer lines that contain an action keyword and are at least 15 chars.
  const actionLine = lines.find((l) => ACTION_RE.test(l) && l.length >= 15);
  // Fall back to the first line longer than 20 chars, then the first line overall.
  const candidate = actionLine ?? lines.find((l) => l.length > 20) ?? lines[0];

  return candidate.length <= 120 ? candidate : `${candidate.slice(0, 117)}...`;
}
