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

const SYSTEM_PROMPT = `You are an action-item extractor for phone call transcripts. Find EVERY commitment, task, follow-up, and action item in the conversation — be comprehensive, not selective.

You will be told the date and time the call took place ("Call date"). ALL relative date/time
expressions in the transcript — "tomorrow", "next Monday", "in two days", "this evening",
"by Friday", "in an hour" — refer to that call date, NOT to today. Resolve every such
expression into an absolute ISO 8601 date-time computed from the call date before writing
"dueDate". If no date or time is mentioned at all, leave "dueDate" as null.

Return ONLY a valid JSON array. No markdown fences, no explanation text outside the array:
[
  {
    "title": "<imperative verb phrase ≤60 chars, e.g. 'Send invoice to Rahul by Friday'>",
    "priority": "URGENT|HIGH|MEDIUM|LOW",
    "dueDate": "<absolute ISO 8601 date-time string resolved against the call date, or null>",
    "assignedToMe": <true if the person who recorded this call must act, false if the other party committed to doing it>,
    "notes": "<relevant context: names, amounts, references, project names — or null if nothing useful to add>"
  }
]

Priority guide:
- URGENT: deadline within 24 h of the call, or the words urgent / ASAP / immediately / tonight
- HIGH: deadline 2-3 days from the call, or the words important / priority / by end of week / by tomorrow
- MEDIUM: general task with no stated urgency
- LOW: optional / whenever you get a chance / low stakes

If no action items are found in the transcript, return exactly: []`;

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

function parseResult(raw: string): TranscriptTask[] {
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
        if (!isNaN(d.getTime())) dueDate = d.getTime();
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
    return parseResult(content);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
