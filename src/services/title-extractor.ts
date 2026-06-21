// ── Hindi token list for language detection ──────────────────────────────────

const HI_TOKENS = new Set([
  'kya',
  'hai',
  'hain',
  'tha',
  'thi',
  'ho',
  'kar',
  'karo',
  'karna',
  'mujhe',
  'tumhe',
  'aapko',
  'aap',
  'tum',
  'main',
  'hum',
  'yaar',
  'bhai',
  'dost',
  'kal',
  'aaj',
  'abhi',
  'jaldi',
  'turant',
  'zaroor',
  'zaruri',
  'please',
  'bhej',
  'dekh',
  'bata',
  'nahi',
  'mat',
  'tak',
  'se',
  'wala',
  'wali',
  'gaya',
  'gayi',
  'hoga',
  'hogi',
  'karo',
  'karna',
  'karein',
  'krna',
  'krdo',
  'suno',
  'milo',
  'aao',
  'jao',
  'padho',
  'likho',
  'batao',
  'bhejo',
  'isko',
  'usko',
  'inhe',
  'unhe',
  'yahan',
  'wahan',
  'phir',
  'lekin',
  'aur',
  'ya',
  'toh',
  'to',
  'kyun',
  'kaise',
  'kab',
  'kahan',
  'kaun',
  'waqt',
  'samay',
  'din',
  'raat',
  'subah',
  'shaam',
]);

// ── Hindi verb → English translation map ─────────────────────────────────────

const HINDI_VERB_MAP: Array<[string, string]> = [
  // Multi-word forms first (longer match wins)
  ['call kar', 'Call'],
  ['phone kar', 'Call'],
  ['submit kar', 'Submit'],
  ['jama kar', 'Submit'],
  ['pay kar', 'Pay'],
  ['forward kar', 'Forward'],
  ['share kar', 'Share'],
  ['check kar', 'Check'],
  ['verify kar', 'Verify'],
  ['update kar', 'Update'],
  ['fix kar', 'Fix'],
  ['arrange kar', 'Arrange'],
  ['arrange karo', 'Arrange'],
  ['plan kar', 'Plan'],
  ['plan karo', 'Plan'],
  ['book kar', 'Book'],
  ['book karo', 'Book'],
  ['note kar', 'Note'],
  ['note karo', 'Note'],
  ['confirm kar', 'Confirm'],
  ['confirm karo', 'Confirm'],
  ['inform kar', 'Inform'],
  ['inform karo', 'Inform'],
  ['resolve kar', 'Resolve'],
  ['resolve karo', 'Resolve'],
  ['handle kar', 'Handle'],
  ['handle karo', 'Handle'],
  ['follow up kar', 'Follow up'],
  ['follow up karo', 'Follow up'],
  ['complete kar', 'Complete'],
  ['complete karo', 'Complete'],
  ['finish kar', 'Finish'],
  ['finish karo', 'Finish'],
  ['reply kar', 'Reply'],
  ['reply karo', 'Reply'],
  ['dekh lo', 'Check'],
  ['dekh lena', 'Check'],
  ['bhar do', 'Pay'],
  ['bhej do', 'Send'],
  ['bhej dena', 'Send'],
  ['sun lo', 'Listen'],
  ['sun lena', 'Listen'],
  ['padh lo', 'Read'],
  ['padh lena', 'Read'],
  ['likh do', 'Write'],
  ['likh dena', 'Write'],
  ['mil lo', 'Meet'],
  ['bata do', 'Share'],
  ['bata dena', 'Share'],
  ['kar do', 'Do'],
  ['kar dena', 'Do'],
  ['de do', 'Provide'],
  ['aa jao', 'Come'],
  ['aa jana', 'Come'],
  // Single-word forms
  ['bhej', 'Send'],
  ['bhejo', 'Send'],
  ['bhejna', 'Send'],
  ['dekh', 'Check'],
  ['dekho', 'Check'],
  ['karo', 'Do'],
  ['karna', 'Do'],
  ['kar', 'Do'],
  ['batao', 'Share'],
  ['bata', 'Share'],
  ['dena', 'Provide'],
  ['de', 'Provide'],
  ['do', 'Provide'],
  ['aao', 'Come'],
  ['aana', 'Come'],
  ['aa', 'Come'],
  ['milo', 'Meet'],
  ['mil', 'Meet'],
  ['suno', 'Listen'],
  ['padho', 'Read'],
  ['likho', 'Write'],
];

// Sort by length descending so multi-word variants match first
HINDI_VERB_MAP.sort((a, b) => b[0].length - a[0].length);

// ── English imperative verbs (regex fallback) ─────────────────────────────────

const EN_IMPERATIVE_RE =
  /\b(please\s+)?(send|share|submit|review|check|call|update|prepare|confirm|fill|upload|forward|reply|provide|schedule|fix|complete|attend|join|arrange|handle|ensure|verify|pay|approve|sign|read|plan|book|note|resolve|respond|assign|delegate|escalate|track|test|install|download|write|coordinate|follow up)\b/i;

// ── Language detection ────────────────────────────────────────────────────────

function isHindi(text: string): boolean {
  const words = text.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return false;
  const hiCount = words.filter((w) => HI_TOKENS.has(w)).length;
  return hiCount / words.length > 0.25;
}

// ── Object extraction helpers ─────────────────────────────────────────────────

function extractObjectWords(text: string, afterIndex: number, maxWords = 6): string {
  const tail = text.slice(afterIndex).trim();
  const words = tail.split(/\s+/).filter(Boolean);
  return words.slice(0, maxWords).join(' ');
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text
    .slice(0, max)
    .replace(/\s+\S*$/, '')
    .trim();
}

function capitalize(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function clean(title: string): string {
  return capitalize(title.replace(/^[^\w]+|[^\w]+$/g, '').trim());
}

// ── Hindi path ────────────────────────────────────────────────────────────────

function extractHindiTitle(text: string): string | null {
  const lower = text.toLowerCase();

  for (const [hiVerb, enVerb] of HINDI_VERB_MAP) {
    const idx = lower.indexOf(hiVerb);
    if (idx === -1) continue;
    const afterVerb = idx + hiVerb.length;
    const obj = extractObjectWords(text, afterVerb, 5);
    if (!obj) return enVerb;
    return truncate(`${enVerb} ${obj}`, 70);
  }

  return null;
}

// ── English path (regex-based, compromise not available) ─────────────────────

function extractEnglishTitle(text: string): string | null {
  const match = EN_IMPERATIVE_RE.exec(text);
  if (!match) return null;

  const verbStart = match.index + (match[1]?.length ?? 0); // skip "please "
  const verbWord = match[2] ?? match[0];
  const afterVerb = verbStart + verbWord.length;
  const obj = extractObjectWords(text, afterVerb, 6);

  const verbCapitalized = verbWord.charAt(0).toUpperCase() + verbWord.slice(1).toLowerCase();
  if (!obj) return verbCapitalized;
  return truncate(`${verbCapitalized} ${obj}`, 70);
}

// ── App-specific overrides ────────────────────────────────────────────────────

function appSpecificTitle(text: string, packageName: string): string | null {
  if (packageName === 'com.google.android.gm') {
    const subjectMatch = /subject:\s*(.+)/i.exec(text);
    if (subjectMatch?.[1]) return truncate(subjectMatch[1].trim(), 80);
  }
  if (packageName === 'com.google.android.calendar') {
    // Try to extract event name — text often starts with the event name
    const first = text.split(/[\n\r|]/)[0]?.trim();
    if (first) return truncate(`Meeting: ${first}`, 80);
  }
  return null;
}

// ── Deadline suffix ───────────────────────────────────────────────────────────

function extractDeadlineSuffix(text: string): string {
  const match =
    /\bby (today|tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}(st|nd|rd|th)?)\b/i.exec(
      text
    );
  return match ? ` by ${match[1]}` : '';
}

// ── Main export ───────────────────────────────────────────────────────────────

export function extractTitle(text: string, sender: string, packageName: string): string {
  const trimmedText = text.trim();

  // App-specific override takes priority
  const appTitle = appSpecificTitle(trimmedText, packageName);
  if (appTitle) return clean(appTitle);

  const hindi = isHindi(trimmedText);

  let extracted: string | null = null;

  if (hindi) {
    extracted = extractHindiTitle(trimmedText);
    if (!extracted) {
      // Fallback to English regex on Hinglish messages
      extracted = extractEnglishTitle(trimmedText);
    }
  } else {
    extracted = extractEnglishTitle(trimmedText);
    if (extracted) {
      const deadline = extractDeadlineSuffix(trimmedText);
      if (deadline) extracted = truncate(extracted + deadline, 70);
    }
  }

  if (extracted) return clean(truncate(extracted, 80));

  // Final fallback: sender + first 60 chars
  const preview = trimmedText.slice(0, 60);
  return clean(`${sender}: ${preview}`);
}
