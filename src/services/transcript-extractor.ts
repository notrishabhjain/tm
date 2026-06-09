import { getSetting } from '@/data/storage/settings';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const TIMEOUT_MS = 30_000;
// ~6 000 chars covers a 5-10 min call without exceeding typical context windows.
const MAX_CHARS = 6_000;

export interface TranscriptTask {
  title: string;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: number | null;
  assignedToMe: boolean; // false = the other party committed, still worth tracking
  notes: string | null;
}

export interface TranscriptContext {
  referenceTime?: number; // epoch ms — when the call took place (anchors relative dates)
  callerLabel?: string; // phone number / name of the other party
}

const SYSTEM_PROMPT = `You are an action-item extractor for phone call transcripts. The transcript may be in Hindi, English, or Hinglish (mixed Hindi-English), and may contain speech-recognition errors — interpret the intended meaning, do not discard items because of imperfect transcription.

Find EVERY commitment, task, follow-up, and action item mentioned by either party. Be comprehensive.

You will be told the date and time the call took place ("Call date"). Resolve ALL relative date/time expressions — "kal", "parso", "tomorrow", "next Monday", "aaj shaam", "by Friday", "in an hour", "end of week" — against that call date, NOT today's date. If no time or date is mentioned, set dueDate to null.

Return ONLY a valid JSON array, no markdown:
[
  {
    "title": "<imperative verb phrase ≤60 chars, e.g. 'Send invoice to Rahul by Friday'>",
    "priority": "URGENT|HIGH|MEDIUM|LOW",
    "dueDate": "<ISO 8601 date-time resolved from call date, or null>",
    "assignedToMe": <true if the person who recorded this call must act, false if the other party committed>,
    "notes": "<names, amounts, references, project context — null if nothing useful>"
  }
]

Priority:
- URGENT: deadline within 24 h of the call, or urgent/ASAP/abhi/aaj tak/immediately/tonight
- HIGH: 2-3 days from the call, or important/priority/kal tak/by tomorrow/end of week
- MEDIUM: task with no stated urgency
- LOW: optional, "whenever", "jab time mile", low stakes

Common Hindi/Hinglish action phrases to recognize: "bhej dena", "bhej do", "kar dena", "dekh lena", "bata dena", "call karna", "confirm karo", "meeting rakhna", "payment karna", "forward karna".

Return [] if no action items are found.`;

function formatCallDate(ts: number): string {
  return new Date(ts).toLocaleString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildUserMessage(text: string, ctx?: TranscriptContext): string {
  const parts: string[] = [];
  if (ctx?.referenceTime) {
    parts.push(
      `Call date: ${formatCallDate(ctx.referenceTime)} — resolve every relative date/time in the transcript against this moment.`
    );
  }
  if (ctx?.callerLabel) parts.push(`Other party: ${ctx.callerLabel}`);
  parts.push(`Call transcript:\n\n${text}`);
  return parts.join('\n');
}

function parseResult(raw: string, referenceTime?: number): TranscriptTask[] {
  try {
    const jsonMatch = raw.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (typeof item !== 'object' || item === null) return [];
      const p = item as Record<string, unknown>;
      const title = typeof p['title'] === 'string' && p['title'].length > 0 ? p['title'] : null;
      if (!title) return [];
      const priority = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].includes(String(p['priority']))
        ? (p['priority'] as TranscriptTask['priority'])
        : 'MEDIUM';
      let dueDate: number | null = null;
      if (typeof p['dueDate'] === 'string') {
        const d = new Date(p['dueDate']);
        if (!isNaN(d.getTime())) {
          // Correct hallucinated past years: advance year until date is within 60 days before referenceTime
          if (referenceTime) {
            const floor = referenceTime - 60 * 86_400_000;
            while (d.getTime() < floor) {
              d.setFullYear(d.getFullYear() + 1);
            }
          }
          dueDate = d.getTime();
        }
      }
      const assignedToMe = p['assignedToMe'] !== false;
      const notes =
        typeof p['notes'] === 'string' && p['notes'].length > 0 ? (p['notes'] as string) : null;
      return [{ title, priority, dueDate, assignedToMe, notes } satisfies TranscriptTask];
    });
  } catch {
    return [];
  }
}

export async function extractTasksFromTranscript(
  text: string,
  ctx?: TranscriptContext
): Promise<TranscriptTask[]> {
  const key = getSetting('ai_api_key');
  const model = getSetting('ai_model');
  if (!key) return [];

  const truncated =
    text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + '\n[transcript truncated]' : text;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(truncated, ctx) },
        ],
        max_tokens: 1_200,
        temperature: 0.1,
      }),
    });
    if (!resp.ok) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await resp.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const content: string = data?.choices?.[0]?.message?.content ?? '';
    return parseResult(content, ctx?.referenceTime);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
