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
}

export interface SenderContext {
  confirmCount: number;
  rejectCount: number;
  autoAcceptCount: number;
}

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const TIMEOUT_MS = 12_000;

const SYSTEM_PROMPT = `You are a strict personal task filter for a productivity app. You receive Android notification text and must decide whether it requires the user to personally take a specific action.

The bar for isTask=true is HIGH. Ask yourself:
1. Is someone ASKING THIS USER to do something specific?
2. Is there an action verb the user must perform (reply, send, review, complete, call, attend, pay)?
3. Would ignoring this notification have a real consequence for the user?
4. Is it addressed TO this user personally (not a broadcast, not a status update)?

Respond ONLY with valid JSON — no markdown, no explanation outside the JSON:
{
  "isTask": true|false,
  "title": "<≤60 char imperative title starting with a verb, or null if isTask=false>",
  "priority": "URGENT|HIGH|MEDIUM|LOW",
  "certainty": "high|medium|low",
  "dueDate": "<ISO 8601 date-time string or null>",
  "reason": "<one sentence explaining the decision>"
}

ALWAYS isTask=false for:
- OTPs, 2FA codes, login verification
- Payment receipts, bank transaction alerts, balance updates
- Delivery tracking ("your order is out for delivery", "package dispatched")
- Promotional offers, sales, discounts, coupons, cashback
- News, sports scores, trending topics
- App update available notifications
- Social media likes, story views, follower counts, post impressions
- "Daily digest", "weekly summary", "your activity this week"
- System status updates ("battery low", "storage full", "backup complete")
- Automated reminders that don't need a reply (e.g. weather, step counts)
- Marketing emails or newsletters
- "Someone viewed your profile"
- Streaming recommendations ("New episode available", "Top picks for you")

isTask=true ONLY when:
- A specific named person is requesting something from the user ("Can you send me X?", "Please review Y", "Are you free at Z?")
- A calendar event or meeting reminder where the user must attend or reschedule
- An assigned task from a work tool (Jira, Asana, Trello, GitHub review request)
- A direct message that ends with a question or request the user must answer
- A deadline is explicitly named and the user must act before it

certainty levels:
- high = clear unambiguous personal request or assigned task → auto-added to task list
- medium = probably a request but context is thin or ambiguous → ask user to confirm
- low = borderline case, could be informational → ask user to confirm

Priority:
- URGENT = deadline within 24h, or words like "urgent/ASAP/immediately/critical"
- HIGH = deadline 1-3 days, or words like "important/priority/soon"
- MEDIUM = general task, no stated deadline
- LOW = optional, "whenever you get a chance", low stakes`;

function buildUserMessage(
  notification: NotificationData,
  senderCtx?: SenderContext
): string {
  const appName = appDisplayName(notification.packageName);
  const parts: string[] = [`App: ${appName}`];

  if (notification.title) parts.push(`Sender: ${notification.title}`);

  const text = notification.bigText || notification.text;
  if (text) parts.push(`Message: ${text}`);

  // Include thread context when available (MessagingStyle conversations)
  if (Array.isArray(notification.thread) && notification.thread.length > 1) {
    const threadLines = notification.thread
      .slice(-4) // last 4 messages for context
      .map((m: { sender?: string; text?: string }) => `  ${m.sender ?? 'them'}: ${m.text ?? ''}`)
      .join('\n');
    parts.push(`Conversation context (last ${Math.min(notification.thread.length, 4)} messages):\n${threadLines}`);
  }

  // App-level hints
  if (isNoiseApp(notification.packageName)) {
    parts.push('Note: This app typically sends promotional/informational notifications — be extra skeptical.');
  } else if (isMessagingApp(notification.packageName)) {
    parts.push('Note: This is a direct messaging app — focus on whether the message is a request or question.');
  }

  // Sender history hint
  if (senderCtx) {
    const total = senderCtx.confirmCount + senderCtx.rejectCount;
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
      if (!isNaN(d.getTime())) dueDate = d.getTime();
    }
    return {
      isTask: Boolean(p.isTask),
      title: typeof p.title === 'string' && p.title.length > 0 ? (p.title as string) : null,
      priority,
      certainty,
      dueDate,
      reason: typeof p.reason === 'string' ? (p.reason as string) : '',
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
      return { isTask: false, title: null, priority: 'LOW', certainty: 'high', dueDate: null, reason: 'Noise app with no personal request signal' };
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
        max_tokens: 250,
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
