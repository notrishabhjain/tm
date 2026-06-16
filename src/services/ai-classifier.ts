import type { NotificationData } from '../../modules/notification-listener/src/types';
import { getSetting } from '@/data/storage/settings';
import { appDisplayName, isMessagingApp, isNoiseApp } from './app-name-map';

export interface AIClassifierResult {
  isTask: boolean;
  title: string | null;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  certainty: 'high' | 'medium' | 'low';
  dueDate: number | null;
  reason: string;
  howTo: string | null; // "Reply to the message with confirmation"
  estimatedMinutes: number | null; // 15
  notes: string | null; // additional context extracted from notification
}

export interface SenderContext {
  confirmCount: number;
  rejectCount: number;
  autoAcceptCount: number;
}

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `You are a notification filter for a task manager used by an Indian professional. Decide whether an Android notification requires the recipient to personally take a specific action.

Your threshold for isTask=true is HIGH — only clear, actionable personal requests create tasks.

Respond with ONLY valid JSON, no markdown:
{
  "isTask": true|false,
  "title": "<imperative verb phrase ≤60 chars starting with a verb, null if isTask=false>",
  "priority": "URGENT|HIGH|MEDIUM|LOW",
  "certainty": "high|medium|low",
  "dueDate": "<ISO 8601 date-time string, or null>",
  "howTo": "<one sentence on how to complete this task, null if obvious>",
  "estimatedMinutes": <integer minutes estimate, or null>
}

NEVER a task — always isTask=false:
- OTPs, 2FA codes, login verification
- Payment receipts, UPI/bank transaction alerts, balance updates
- Order or delivery status ("out for delivery", "dispatched", "delivered")
- Promotional offers, discounts, cashback, sale announcements
- News, cricket/sports scores, trending topics
- Social media likes, views, story reactions, follower counts
- System alerts (battery low, storage full, backup done)
- App update available
- Marketing emails, newsletters, weekly/daily digests
- Automated reminders with no human asking (weather, step count, sleep summary)

ALWAYS a task — isTask=true when:
- A specific person asks the user to do something: "please send", "can you review", "bhej do", "kar dena", "dekh lo", "bata do", "confirm kar"
- A work tool assigns something: Jira ticket, GitHub review request, Asana task, Trello card
- A calendar invite or meeting reminder the user must attend or respond to
- A direct message ending with a question or request the user is expected to answer
- A deadline is attached to an action the user must take
- Hinglish requests: "send kar do", "review kar lo", "kal tak bhej", "aaj confirm karo"

Certainty:
- high: unambiguous personal request or assigned task → auto-add without asking user
- medium: probably a request but context is thin or sender is ambiguous → ask user to confirm
- low: borderline — could be informational → ask user to confirm

Priority:
- URGENT: deadline within 24 h, or words like urgent/ASAP/immediately/aaj tak/abhi/critical
- HIGH: deadline 1-3 days, or important/priority/kal tak/soon/by tomorrow
- MEDIUM: task with no stated urgency
- LOW: optional, "whenever you get a chance", "jab time ho", low stakes

dueDate: extract from "by tomorrow", "kal tak", "aaj shaam 5 baje", "by 3pm", "next Monday", "25 tarikh tak". Use today's date if only a clock time is given. Set null if no date or time is mentioned.`;

function formatNow(): string {
  return new Date().toLocaleString('en-IN', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function buildUserMessage(notification: NotificationData, senderCtx?: SenderContext): string {
  const appName = appDisplayName(notification.packageName);
  const parts: string[] = [
    `Current date: ${formatNow()} — resolve every relative date/time against this moment.`,
    `App: ${appName}`,
  ];

  if (notification.title) parts.push(`Sender: ${notification.title}`);

  const text = notification.bigText || notification.text;
  if (text) parts.push(`Message: ${text}`);

  // Include thread context when available (MessagingStyle conversations)
  if (Array.isArray(notification.thread) && notification.thread.length > 1) {
    const threadLines = notification.thread
      .slice(-4) // last 4 messages for context
      .map((m: { sender?: string; text?: string }) => `  ${m.sender ?? 'them'}: ${m.text ?? ''}`)
      .join('\n');
    parts.push(
      `Conversation context (last ${Math.min(notification.thread.length, 4)} messages):\n${threadLines}`
    );
  }

  // App-level hints
  if (isNoiseApp(notification.packageName)) {
    parts.push(
      'Note: This app typically sends promotional/informational notifications — be extra skeptical.'
    );
  } else if (isMessagingApp(notification.packageName)) {
    parts.push(
      'Note: This is a direct messaging app — focus on whether the message is a request or question.'
    );
  }

  // Sender history hint
  if (senderCtx) {
    const total = senderCtx.confirmCount + senderCtx.rejectCount + senderCtx.autoAcceptCount;
    if (total >= 3) {
      const rejectRate = Math.round((senderCtx.rejectCount / total) * 100);
      const confirmRate = 100 - rejectRate;
      if (rejectRate >= 70) {
        parts.push(
          `Sender history: user has rejected ${rejectRate}% of notifications from this sender — likely noise.`
        );
      } else if (confirmRate >= 70) {
        parts.push(
          `Sender history: user confirms ${confirmRate}% of notifications from this sender — usually tasks.`
        );
      }
    }
  }

  return parts.join('\n');
}

function parseResult(raw: string): AIClassifierResult | null {
  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const parsed = JSON.parse(jsonMatch[0]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
    const p = parsed as any;
    const priority = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].includes(String(p.priority))
      ? (p.priority as AIClassifierResult['priority'])
      : 'MEDIUM';
    const certainty = ['high', 'medium', 'low'].includes(String(p.certainty))
      ? (p.certainty as AIClassifierResult['certainty'])
      : 'medium';
    let dueDate: number | null = null;
    if (p.dueDate && typeof p.dueDate === 'string') {
      const d = new Date(p.dueDate as string);
      if (!isNaN(d.getTime())) {
        // Correct hallucinated past years: advance until within 60 days before now
        const floor = Date.now() - 60 * 86_400_000;
        while (d.getTime() < floor) {
          d.setFullYear(d.getFullYear() + 1);
        }
        dueDate = d.getTime();
      }
    }
    const howTo = typeof p.howTo === 'string' && p.howTo.length > 0 ? (p.howTo as string) : null;
    const estimatedMinutes =
      typeof p.estimatedMinutes === 'number' && p.estimatedMinutes > 0
        ? Math.round(p.estimatedMinutes as number)
        : null;
    return {
      isTask: Boolean(p.isTask),
      title: typeof p.title === 'string' && p.title.length > 0 ? (p.title as string) : null,
      priority,
      certainty,
      dueDate,
      reason: typeof p.reason === 'string' ? (p.reason as string) : '',
      howTo,
      estimatedMinutes,
      notes: null,
    };
  } catch {
    return null;
  }
}

export async function classifyNotification(
  notification: NotificationData,
  senderCtx?: SenderContext,
  apiKey?: string,
  model?: string
): Promise<AIClassifierResult | null> {
  const key = apiKey ?? getSetting('ai_api_key');
  const mdl = model ?? getSetting('ai_model');
  if (!key) return null;

  // Short-circuit obvious noise apps before burning an API call
  if (isNoiseApp(notification.packageName)) {
    const text = (notification.bigText || notification.text || '').toLowerCase();
    // Only pass through if the text looks like a direct personal message
    const hasPersonalSignal =
      text.includes('?') ||
      text.includes('please') ||
      text.includes('urgent') ||
      text.includes('asap') ||
      text.includes('reminder:') ||
      text.includes('due');
    if (!hasPersonalSignal) {
      return {
        isTask: false,
        title: null,
        priority: 'LOW',
        certainty: 'high',
        dueDate: null,
        howTo: null,
        estimatedMinutes: null,
        notes: null,
        reason: 'Noise app with no personal request signal',
      };
    }
  }

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
          { role: 'user', content: buildUserMessage(notification, senderCtx) },
        ],
        max_tokens: 400,
        temperature: 0.05,
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
