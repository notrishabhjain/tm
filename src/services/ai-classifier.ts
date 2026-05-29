import type { NotificationData } from '../../modules/notification-listener/src/types';
import { getSetting } from '@/data/storage/settings';

export interface AIClassifierResult {
  isTask: boolean;
  title: string | null;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: number | null;
  reason: string;
}

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const TIMEOUT_MS = 10_000;

const SYSTEM_PROMPT = `You are a task extraction AI for a personal productivity app. Android notification text arrives. Decide if it requires user action and extract a task if so.

Respond ONLY with valid JSON — no markdown, no explanation outside the JSON.

{
  "isTask": true|false,
  "title": "<≤60 char imperative title in English, or null if isTask=false>",
  "priority": "URGENT|HIGH|MEDIUM|LOW",
  "dueDate": "<ISO 8601 date-time string or null>",
  "reason": "<one sentence>"
}

isTask=false: OTPs, promotions, delivery tracking, news, sports scores, payment receipts, system alerts with no user action.
isTask=true: messages needing a reply, assigned tasks, deadlines, questions, meetings, things to send or complete.

Priority: URGENT=deadline<24h or "urgent/ASAP/critical"; HIGH=1-3 days or "important/priority"; MEDIUM=general task; LOW=optional/whenever.`;

function buildUserMessage(notification: NotificationData): string {
  const parts: string[] = [];
  if (notification.packageName) parts.push(`App: ${notification.packageName}`);
  if (notification.title) parts.push(`Sender: ${notification.title}`);
  const text = notification.bigText || notification.text;
  if (text) parts.push(`Text: ${text}`);
  return parts.join('\n');
}

function parseResult(raw: string): AIClassifierResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(jsonMatch[0]);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const p = parsed as any;
    const priority = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].includes(String(p.priority))
      ? (p.priority as AIClassifierResult['priority'])
      : 'MEDIUM';
    let dueDate: number | null = null;
    if (p.dueDate && typeof p.dueDate === 'string') {
      const d = new Date(p.dueDate as string);
      if (!isNaN(d.getTime())) dueDate = d.getTime();
    }
    return {
      isTask: Boolean(p.isTask),
      title: typeof p.title === 'string' && p.title.length > 0 ? (p.title as string) : null,
      priority,
      dueDate,
      reason: typeof p.reason === 'string' ? (p.reason as string) : '',
    };
  } catch {
    return null;
  }
}

export async function classifyNotification(
  notification: NotificationData,
  apiKey?: string,
  model?: string
): Promise<AIClassifierResult | null> {
  const key = apiKey ?? getSetting('ai_api_key');
  const mdl = model ?? getSetting('ai_model');
  if (!key) return null;

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
        model: mdl,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: buildUserMessage(notification) },
        ],
        max_tokens: 200,
        temperature: 0.1,
      }),
    });

    if (!resp.ok) return null;

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const data = await resp.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const content: string = (data as any).choices?.[0]?.message?.content ?? '';
    return parseResult(content);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function testConnection(
  apiKey: string,
  model: string
): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    if (resp.ok) return { ok: true };
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const err = await resp.json().catch(() => ({}));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    return { ok: false, error: (err as any)?.detail ?? `HTTP ${resp.status}` };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
  } finally {
    clearTimeout(timer);
  }
}
