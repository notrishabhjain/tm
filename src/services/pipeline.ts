import type { NotificationData } from '../../modules/notification-listener/src/types';
import NotificationListener from '../../modules/notification-listener/src';
import { initializeDatabase, db } from '@/data/db/client';
import { ConversationRepository } from '@/data/repositories/ConversationRepository';
import type { StoredMessage } from '@/data/repositories/ConversationRepository';
import {
  checkAndRecordFingerprint,
  logActivity,
  enqueueOutbox,
  getOutbox,
  removeOutboxRow,
  bumpOutboxAttempts,
} from '@/data/pipeline-store';
import { createGoogleTask, buildGoogleTaskNotes } from './google-tasks';
import { appDisplayName } from './app-name-map';
import { getSetting } from '@/data/storage/settings';

// ── The single decision-maker ─────────────────────────────────────────────────
// TaskMind v2 has exactly one intelligence: this LLM call. There is no scorer,
// no keyword engine, no review queue. What the model says goes straight to
// Google Tasks — so the prompt is engineered for maximum precision:
// reasoning-first output, worked examples covering both languages and both
// verdicts, and explicit tests a message must pass to count as a task.

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
// Accuracy is the product. Calls + notifications both use the strongest
// free-tier model; notification volume after native hard filters is low
// enough that latency/rate limits are a non-issue.
const MODEL = 'meta/llama-3.3-70b-instruct';
const TIMEOUT_MS = 25_000;

const NOTIFICATION_PROMPT = `You are the sole gatekeeper of a busy Indian professional's to-do list. You read one incoming message (with its conversation history when available) and decide: does this message give the USER a concrete task? Your verdict is final — a "yes" goes straight onto their Google Tasks list with no human review. A false task wastes their attention; a missed task means a dropped commitment to a real person.

Messages are in Hindi, English, or Hinglish (Hindi in Latin script). Read them as a native speaker would.

THE THREE TESTS — all must pass for isTask=true:
1. A specific person is asking or expecting THE USER to do something, OR the user has committed to do something. (Automated senders, systems, and broadcasts never assign tasks.)
2. The action is concrete: it has a verb and an object — something the user could tick off as done. ("Send the invoice" ✓, "we should catch up sometime" ✗)
3. The message is directed at the user personally — not group chatter between other people, not a broadcast, not an FYI they merely need to know.

A meeting/appointment the user is expected to attend passes all three tests ("attend" is the action).

NEVER a task, regardless of wording: OTPs and verification codes, payment/bank confirmations, delivery status, promotions and offers, news, social-media activity, app/system alerts, group messages where someone ELSE is asked to do something.

You will be given today's date and time. Resolve all relative expressions — "kal", "parso", "aaj shaam", "tomorrow", "by Friday", "5 baje" — against it. "kal" with a deadline meaning = tomorrow. If no time is stated for a date, use 18:00.

Respond with ONLY this JSON, no markdown. Fill "reasoning" FIRST and keep it to 1-2 sentences:
{
  "reasoning": "<who wants what from whom, and which of the three tests pass or fail>",
  "isTask": true|false,
  "title": "<imperative, ≤60 chars, quoting the concrete specifics (names/amounts/documents), in English — null if isTask=false>",
  "priority": "URGENT|HIGH|MEDIUM|LOW",
  "dueDate": "<ISO 8601 date-time or null>",
  "notes": "<amounts, references, context worth keeping — null if none>"
}

Priority: URGENT = explicit urgency or deadline within ~24h (urgent/ASAP/abhi/aaj/turant/immediately); HIGH = deadline in 1-3 days or clearly important (kal tak/by tomorrow/important); MEDIUM = a real task with no stated urgency; LOW = optional/whenever (jab time mile).

WORKED EXAMPLES

[Today: Monday 7 July, 2:00 PM] WhatsApp, from "Sharma Ji": "beta woh 25000 ka payment kal tak kar dena warna late fee lagegi"
{"reasoning":"Sharma Ji is directly asking the user to make a ₹25000 payment by tomorrow — personal request, concrete action, directed at the user. All three tests pass.","isTask":true,"title":"Pay ₹25,000 to Sharma Ji (late fee after tomorrow)","priority":"HIGH","dueDate":"<tomorrow>T18:00:00","notes":"Late fee applies if missed"}

[Today: Monday 7 July, 2:00 PM] WhatsApp, from "Boss": "Client call got moved — can you share the revised deck before 11 tomorrow?"
{"reasoning":"The boss personally asks the user to share the revised deck before 11 AM tomorrow. Concrete deliverable with a deadline. All tests pass.","isTask":true,"title":"Share revised client deck with Boss","priority":"HIGH","dueDate":"<tomorrow>T11:00:00","notes":"Client call was rescheduled"}

[Today: Monday 7 July, 2:00 PM] WhatsApp group "College Friends", from "Amit": "bhai Rohit tu hi book kar le tickets, tera card pe offer hai"
{"reasoning":"Amit is asking ROHIT to book tickets, not the user. Test 3 fails — the request targets someone else in the group.","isTask":false,"title":null,"priority":"LOW","dueDate":null,"notes":null}

[Today: Monday 7 July, 2:00 PM] SMS, from "HDFCBK": "Rs.4,500 debited from a/c XX1234 for UPI txn. Avl bal: Rs.52,310"
{"reasoning":"Automated bank debit confirmation — no person, no request, purely informational. Test 1 fails.","isTask":false,"title":null,"priority":"LOW","dueDate":null,"notes":null}

[Today: Monday 7 July, 2:00 PM] WhatsApp, from "Priya": "haan sab theek! chalo phir baat karte hain, bye"
{"reasoning":"Small talk closing a chat — no action requested or committed. Test 2 fails.","isTask":false,"title":null,"priority":"LOW","dueDate":null,"notes":null}`;

export interface PipelineDecision {
  isTask: boolean;
  reasoning: string;
  title: string | null;
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  dueDate: number | null;
  notes: string | null;
}

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

// Exported for unit tests — pure parsing of the model output.
export function parseDecision(raw: string): PipelineDecision | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start === -1 || end <= start) return null;
    const p = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const priority = ['URGENT', 'HIGH', 'MEDIUM', 'LOW'].includes(String(p['priority']))
      ? (p['priority'] as PipelineDecision['priority'])
      : 'MEDIUM';
    let dueDate: number | null = null;
    if (typeof p['dueDate'] === 'string' && p['dueDate'] !== 'null') {
      const d = new Date(p['dueDate']);
      if (!isNaN(d.getTime())) {
        // Advance hallucinated past years until within 60 days before now
        const floor = Date.now() - 60 * 86_400_000;
        let guard = 0;
        while (d.getTime() < floor && guard < 10) {
          d.setFullYear(d.getFullYear() + 1);
          guard++;
        }
        dueDate = d.getTime();
      }
    }
    const title =
      typeof p['title'] === 'string' && p['title'].trim() && p['title'] !== 'null'
        ? p['title'].trim().slice(0, 120)
        : null;
    return {
      isTask: p['isTask'] === true && title !== null,
      reasoning: typeof p['reasoning'] === 'string' ? p['reasoning'] : '',
      title,
      priority,
      dueDate,
      notes:
        typeof p['notes'] === 'string' && p['notes'].trim() && p['notes'] !== 'null'
          ? p['notes'].trim()
          : null,
    };
  } catch {
    return null;
  }
}

async function decide(
  notification: NotificationData,
  history: StoredMessage[]
): Promise<PipelineDecision | null> {
  const key = getSetting('ai_api_key');
  if (!key) return null;

  const parts: string[] = [
    `Today: ${formatNow()} — resolve every relative date/time against this moment.`,
    `App: ${appDisplayName(notification.packageName)}`,
    `From: ${notification.title || 'Unknown'}${notification.isGroup ? ' (group chat)' : ''}`,
    `Message: ${notification.bigText || notification.text}`,
  ];
  if (history.length > 1) {
    const lines = history
      .slice(-30)
      .map((m) => `  ${m.sender}: ${m.text}`)
      .join('\n');
    parts.push(`Conversation history (oldest first):\n${lines}`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: MODEL,
            temperature: 0.05,
            max_tokens: 500,
            messages: [
              { role: 'system', content: NOTIFICATION_PROMPT },
              { role: 'user', content: parts.join('\n') },
            ],
          }),
        });
        if (resp.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const data = (await resp.json()) as any;
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          const content: string = data?.choices?.[0]?.message?.content ?? '';
          return parseDecision(content);
        }
        if (resp.status !== 429 && resp.status < 500) return null;
      } catch (e) {
        if ((e as Error).name === 'AbortError') return null;
      }
      if (attempt === 1) await new Promise((r) => setTimeout(r, 3000));
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// ── Pipeline entry: one notification in, zero or one Google task out ─────────

const _inFlight = new Set<string>();

export async function handleNotification(taskData: {
  notification: NotificationData;
}): Promise<void> {
  const { notification } = taskData;
  initializeDatabase();

  const text = notification.bigText || notification.text || '';
  if (!text.trim()) return;

  // Identity = conversation key + content hash: re-deliveries of the same
  // message are dropped; new messages in the same conversation pass.
  const contentHash = simpleHash(`${notification.title}|${text}`);
  const fingerprint = `${notification.packageName}|${contentHash}`;
  if (_inFlight.has(fingerprint)) return;
  _inFlight.add(fingerprint);

  try {
    if (await checkAndRecordFingerprint(fingerprint)) return; // already processed

    const label = notification.title || appDisplayName(notification.packageName);

    // Persist thread + load history so the LLM sees the whole conversation.
    const convRepo = new ConversationRepository(db);
    let history: StoredMessage[] = [];
    if (notification.title && Array.isArray(notification.thread)) {
      const convKey = `${notification.packageName}::${notification.title}`;
      const msgs = notification.thread
        .filter((m) => m.text && m.text.trim())
        .map((m, i) => ({
          sender: m.sender || 'them',
          text: m.text,
          timestamp: m.timestamp || (notification.postTime || Date.now()) - i,
        }));
      await convRepo.saveMessages(convKey, msgs).catch(() => {});
      history = await convRepo.getHistory(convKey).catch(() => []);
    }

    const decision = await decide(notification, history);

    if (decision === null) {
      await logActivity(
        notification.packageName,
        label,
        'ERROR',
        'AI unreachable — message skipped'
      );
      return;
    }
    if (!decision.isTask || !decision.title) {
      await logActivity(
        notification.packageName,
        label,
        'SKIPPED',
        decision.reasoning || 'Not a task'
      );
      return;
    }

    const notes = buildGoogleTaskNotes({
      priority: decision.priority,
      sender: notification.title,
      sourceApp: notification.packageName,
      dueDate: decision.dueDate,
      body: decision.notes ? `${decision.notes}\n\n${text}` : text,
    });

    const googleTaskId = await createGoogleTask({
      title: decision.title,
      notes,
      dueDate: decision.dueDate,
    });

    if (googleTaskId) {
      await logActivity(notification.packageName, label, 'TASK_CREATED', decision.title);
      void NotificationListener.postConfirmation(
        'Task added',
        `${decision.title} — from ${label}`
      ).catch(() => {});
    } else {
      await enqueueOutbox(decision.title, notes, decision.dueDate);
      await logActivity(notification.packageName, label, 'QUEUED', decision.title);
    }
  } catch (e) {
    await logActivity(
      notification.packageName,
      notification.title || notification.packageName,
      'ERROR',
      String(e).slice(0, 150)
    ).catch(() => {});
  } finally {
    setTimeout(() => _inFlight.delete(fingerprint), 60_000);
  }
}

// ── Outbox flush: retries queued tasks (offline / token failures) ────────────

let _flushing = false;

export async function flushOutbox(): Promise<number> {
  if (_flushing) return 0;
  _flushing = true;
  let flushed = 0;
  try {
    initializeDatabase();
    const rows = await getOutbox();
    for (const row of rows) {
      const googleTaskId = await createGoogleTask({
        title: row.title,
        notes: row.notes ?? undefined,
        dueDate: row.dueDate,
      });
      if (googleTaskId) {
        await removeOutboxRow(row.id);
        await logActivity('outbox', row.title.slice(0, 40), 'TASK_CREATED', row.title);
        flushed++;
      } else {
        await bumpOutboxAttempts(row.id);
        break; // network/token still down — stop, retry next flush
      }
    }
    if (flushed > 0) {
      void NotificationListener.postConfirmation(
        'Tasks synced',
        `${flushed} task${flushed !== 1 ? 's' : ''} added to Google Tasks`
      ).catch(() => {});
    }
  } catch {
    /* next flush retries */
  } finally {
    _flushing = false;
  }
  return flushed;
}

function simpleHash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}
