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

const SYSTEM_PROMPT = `You are an action-item extractor for phone call transcripts. Find EVERY commitment, task, follow-up, and action item in the conversation — be comprehensive, not selective.

Return ONLY a valid JSON array. No markdown fences, no explanation text outside the array:
[
  {
    "title": "<imperative verb phrase ≤60 chars, e.g. 'Send invoice to Rahul by Friday'>",
    "priority": "URGENT|HIGH|MEDIUM|LOW",
    "dueDate": "<ISO 8601 date-time string if a deadline was mentioned, else null>",
    "assignedToMe": <true if the person who recorded this call must act, false if the other party committed to doing it>,
    "notes": "<relevant context: names, amounts, references, project names — or null if nothing useful to add>"
  }
]

Priority guide:
- URGENT: deadline within 24 h, or the words urgent / ASAP / immediately / tonight
- HIGH: deadline 2-3 days, or the words important / priority / by end of week / by tomorrow
- MEDIUM: general task with no stated urgency
- LOW: optional / whenever you get a chance / low stakes

If no action items are found in the transcript, return exactly: []`;

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

export async function extractTasksFromTranscript(text: string): Promise<TranscriptTask[]> {
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
          { role: 'user', content: `Call transcript:\n\n${truncated}` },
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
