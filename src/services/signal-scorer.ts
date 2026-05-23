import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { tasks, senderStats, learnedKeywords } from '@/data/db/schema';
import type { DiscardReason } from '@/domain/types';
import type { NotificationData } from '../../modules/notification-listener/src/types';
import { getSetting } from '@/data/storage/settings';
import { loadModel } from './model-manager';
import { runInference } from './intent-model';

export interface ScoringResult {
  score: number;
  ruleScore: number;
  modelScore: number | null;
  decision: 'CREATE' | 'CONFIRM' | 'DISCARD';
  forceInbox: boolean;
  signals: string[];
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  extractedDeadline: number | null;
  discardReason: DiscardReason | null;
}

type Tier = 'VIP_WORK' | 'VIP_PERSONAL' | 'WORK' | 'INFO' | 'UNKNOWN';

interface TierThresholds {
  createThreshold: number;
  discardThreshold: number;
}

interface SenderInfo {
  effectiveTrust: number;
  tier: Tier;
  thresholds: TierThresholds;
  isUnknown: boolean;
}

// ── Sender key ───────────────────────────────────────────────────────────────

export function buildSenderKey(packageName: string, sender: string): string {
  const normalizedSender = sender.trim().toLowerCase().replace(/\s+/g, '_');
  return `${packageName}::${normalizedSender}`;
}

// ── Sender DB lookup ─────────────────────────────────────────────────────────

async function loadSenderInfo(senderKey: string): Promise<SenderInfo> {
  try {
    const rows = await db
      .select()
      .from(senderStats)
      .where(eq(senderStats.senderKey, senderKey))
      .limit(1);

    if (!rows[0]) {
      return unknownSender();
    }

    const row = rows[0] as typeof senderStats.$inferSelect;
    const totalInteractions = row.confirmCount + row.rejectCount + row.autoAcceptCount;
    const computedTrust = row.confirmCount / (row.confirmCount + row.rejectCount + 1);

    const effectiveTrust =
      row.seedTrust != null && totalInteractions < 10 ? row.seedTrust : computedTrust;

    const rawTier = row.tier as Tier;
    const tier = deriveTier(rawTier, effectiveTrust, totalInteractions);

    return {
      effectiveTrust,
      tier,
      thresholds: thresholdsForTier(tier),
      isUnknown: tier === 'UNKNOWN',
    };
  } catch {
    return unknownSender();
  }
}

function unknownSender(): SenderInfo {
  return {
    effectiveTrust: 0,
    tier: 'UNKNOWN',
    thresholds: { createThreshold: 1.1, discardThreshold: -1 },
    isUnknown: true,
  };
}

function deriveTier(stored: Tier, trust: number, interactions: number): Tier {
  if (stored === 'VIP_PERSONAL') return 'VIP_PERSONAL';
  if (stored === 'VIP_WORK' || trust >= 0.8) return 'VIP_WORK';
  if (stored === 'UNKNOWN' && interactions < 3) return 'UNKNOWN';
  if (trust >= 0.5) return 'WORK';
  if (trust > 0) return 'INFO';
  return 'UNKNOWN';
}

function thresholdsForTier(tier: Tier): TierThresholds {
  switch (tier) {
    case 'VIP_WORK':
      return { createThreshold: 0.5, discardThreshold: 0.25 };
    case 'VIP_PERSONAL':
      return { createThreshold: 0.55, discardThreshold: 0.3 };
    case 'WORK':
      return { createThreshold: 0.65, discardThreshold: 0.35 };
    case 'INFO':
      return { createThreshold: 0.75, discardThreshold: 0.45 };
    case 'UNKNOWN':
      return { createThreshold: 1.1, discardThreshold: -1 };
  }
}

// ── Learned keywords ─────────────────────────────────────────────────────────

interface ActiveKw {
  ngram: string;
  weight: number;
}

async function loadActiveKeywords(): Promise<ActiveKw[]> {
  try {
    const rows = await db
      .select({ ngram: learnedKeywords.ngram, weight: learnedKeywords.weight })
      .from(learnedKeywords)
      .where(eq(learnedKeywords.status, 'ACTIVE'));
    return rows as ActiveKw[];
  } catch {
    return [];
  }
}

// ── Thread context boost ─────────────────────────────────────────────────────

async function hasRecentThreadTask(sender: string, sourceApp: string): Promise<boolean> {
  try {
    const cutoff = Date.now() - 2 * 60 * 60 * 1000;
    const rows = await db
      .select({ id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.sender, sender),
          eq(tasks.sourceApp, sourceApp),
          isNull(tasks.deletedAt),
          gt(tasks.createdAt, cutoff)
        )
      )
      .limit(1);
    return rows.length > 0;
  } catch {
    return false;
  }
}

// ── Deadline extraction ───────────────────────────────────────────────────────

function extractDeadline(text: string): number | null {
  const lower = text.toLowerCase();
  const now = new Date();
  const nowMs = now.getTime();
  const deadlines: number[] = [];

  const eod = (d: Date): number => {
    const r = new Date(d);
    r.setHours(23, 59, 59, 999);
    return r.getTime();
  };

  const nextWeekday = (target: number): number => {
    const d = new Date(now);
    const diff = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    return eod(d);
  };

  // ── Relative terms ────────────────────────────────────────────────────────
  if (/\btomorrow\b/.test(lower)) {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    deadlines.push(eod(d));
  }
  if (/\b(today|tonight|eod|cob|end of day)\b/.test(lower)) deadlines.push(eod(now));
  if (/\basap\b/.test(lower)) deadlines.push(nowMs + 3_600_000);

  const hoursMatch = lower.match(/\bin (\d+)\s*hours?\b/);
  if (hoursMatch) deadlines.push(nowMs + parseInt(hoursMatch[1], 10) * 3_600_000);

  const daysMatch = lower.match(/\bin (\d+)\s*days?\b/);
  if (daysMatch) deadlines.push(nowMs + parseInt(daysMatch[1], 10) * 86_400_000);

  // ── Named weekdays ────────────────────────────────────────────────────────
  const weekdays: Array<[string, number]> = [
    ['sunday', 0],
    ['monday', 1],
    ['tuesday', 2],
    ['wednesday', 3],
    ['thursday', 4],
    ['friday', 5],
    ['saturday', 6],
  ];
  for (const [name, idx] of weekdays) {
    if (lower.includes(name)) deadlines.push(nextWeekday(idx));
  }

  // ── This week / next week ─────────────────────────────────────────────────
  if (/\bthis\s+week\b/.test(lower)) deadlines.push(nextWeekday(5));
  if (/\bnext\s+week\b/.test(lower)) {
    const d = new Date(now);
    const toFri = (5 - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + toFri + 7);
    deadlines.push(eod(d));
  }

  // ── Time of day: "by 3pm", "before 5:30 AM", "by 15:00" ──────────────────
  const amPmMatch = lower.match(/\b(?:by|before|at)\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/);
  if (amPmMatch) {
    let h = parseInt(amPmMatch[1], 10);
    const m = amPmMatch[2] ? parseInt(amPmMatch[2], 10) : 0;
    if (amPmMatch[3] === 'pm' && h < 12) h += 12;
    if (amPmMatch[3] === 'am' && h === 12) h = 0;
    const d = new Date(now);
    d.setHours(h, m, 0, 0);
    if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
    deadlines.push(d.getTime());
  } else {
    // 24-hour time with colon: "by 15:00", "before 18:30"
    const h24 = lower.match(/\b(?:by|before|at)\s+([01]?\d|2[0-3]):([0-5]\d)\b/);
    if (h24) {
      const d = new Date(now);
      d.setHours(parseInt(h24[1], 10), parseInt(h24[2], 10), 0, 0);
      if (d.getTime() <= nowMs) d.setDate(d.getDate() + 1);
      deadlines.push(d.getTime());
    }
  }

  // ── Month-name patterns (checked before ordinal-only to avoid conflict) ───
  const MONTHS =
    'jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|' +
    'aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?';
  const toMonthIdx = (s: string): number => {
    const key = s.slice(0, 3).toLowerCase();
    const map: Record<string, number> = {
      jan: 0,
      feb: 1,
      mar: 2,
      apr: 3,
      may: 4,
      jun: 5,
      jul: 6,
      aug: 7,
      sep: 8,
      oct: 9,
      nov: 10,
      dec: 11,
    };
    return map[key] ?? -1;
  };

  let monthDayMatched = false;

  // "by Jan 5" / "by January 5th"
  const mdMatch = lower.match(
    new RegExp(`\\b(?:by|before|on|till?)\\s+(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`)
  );
  if (mdMatch) {
    monthDayMatched = true;
    const mi = toMonthIdx(mdMatch[1]);
    const day = parseInt(mdMatch[2], 10);
    if (mi !== -1 && day >= 1 && day <= 31) {
      let yr = now.getFullYear();
      if (new Date(yr, mi, day).getTime() < nowMs) yr += 1;
      deadlines.push(new Date(yr, mi, day, 23, 59, 59, 999).getTime());
    }
  }

  // "by 5 Jan" / "by 5th January"
  if (!monthDayMatched) {
    const dmMatch = lower.match(
      new RegExp(`\\b(?:by|before|on|till?)\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(${MONTHS})\\b`)
    );
    if (dmMatch) {
      monthDayMatched = true;
      const day = parseInt(dmMatch[1], 10);
      const mi = toMonthIdx(dmMatch[2]);
      if (mi !== -1 && day >= 1 && day <= 31) {
        let yr = now.getFullYear();
        if (new Date(yr, mi, day).getTime() < nowMs) yr += 1;
        deadlines.push(new Date(yr, mi, day, 23, 59, 59, 999).getTime());
      }
    }
  }

  // ── Absolute day-of-month with ordinal: "by 25th", "before the 3rd" ───────
  if (!monthDayMatched) {
    const domMatch = lower.match(
      /\b(?:by|before|on|till?)\s+(?:the\s+)?(\d{1,2})(?:st|nd|rd|th)\b/
    );
    if (domMatch) {
      const day = parseInt(domMatch[1], 10);
      if (day >= 1 && day <= 31) {
        const d = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59, 999);
        if (d.getTime() <= nowMs) d.setMonth(d.getMonth() + 1);
        deadlines.push(d.getTime());
      }
    }
  }

  // ── DD/MM[/YYYY]: "by 25/6", "before 3/12/2025" ──────────────────────────
  const slashMatch = lower.match(
    /\b(?:by|before|on|till?)\s+(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/
  );
  if (slashMatch) {
    const day = parseInt(slashMatch[1], 10);
    const month = parseInt(slashMatch[2], 10) - 1;
    let yr = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    if (yr < 100) yr += 2000;
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      deadlines.push(new Date(yr, month, day, 23, 59, 59, 999).getTime());
    }
  }

  // ── Hindi absolute date: "25 tarikh tak", "25 tarik ko" ──────────────────
  const hindiMatch = lower.match(/\b(\d{1,2})\s*(?:tarikh|tarik|taarik)\b/);
  if (hindiMatch) {
    const day = parseInt(hindiMatch[1], 10);
    if (day >= 1 && day <= 31) {
      const d = new Date(now.getFullYear(), now.getMonth(), day, 23, 59, 59, 999);
      if (d.getTime() <= nowMs) d.setMonth(d.getMonth() + 1);
      deadlines.push(d.getTime());
    }
  }

  return deadlines.length > 0 ? Math.min(...deadlines) : null;
}

// ── Word count helper ─────────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

// ── Force discard — definitive non-tasks ──────────────────────────────────────
// These categories are NEVER actionable tasks. They bypass scoring entirely and
// are discarded with a specific reason. Order matters: most specific first.

interface ForceDiscardResult {
  force: boolean;
  reason: DiscardReason | null;
  signal: string;
}

const NO_DISCARD: ForceDiscardResult = { force: false, reason: null, signal: '' };

function checkForceDiscard(text: string, packageName: string): ForceDiscardResult {
  const t = text.trim();
  const lower = t.toLowerCase();

  // Empty / near-empty — no actionable content
  if (t.length < 3 || wordCount(t) === 0) {
    return { force: true, reason: 'TOO_SHORT', signal: 'empty_content' };
  }

  // System / OS-level notifications
  if (
    packageName === 'android' ||
    packageName === 'com.android.systemui' ||
    packageName === 'com.google.android.gms' ||
    /\b(app update available|new version available|software update|system update available|please update the app)\b/i.test(
      lower
    )
  ) {
    return { force: true, reason: 'FILTERED', signal: 'system_message' };
  }

  // OTP / 2FA verification codes — extremely common false positive
  if (
    /\b(otp|one[- ]time (?:password|code|pin)|verification code|security code|login code|auth(?:entication)? code)\b/i.test(
      lower
    ) ||
    /\b(?:code|otp|pin)\s*(?:is|:)?\s*\d{4,8}\b/i.test(lower) ||
    /^\d{4,8}\s+is\s+(?:your|the)\b/i.test(lower) ||
    /\b\d{4,8}\b[^.]{0,40}\b(?:expires?|valid for|do not share|kisi ko mat|share na karein)\b/i.test(
      lower
    )
  ) {
    return { force: true, reason: 'SPAM_OR_OTP', signal: 'otp_code' };
  }

  // Bank / payment transaction confirmations (informational, not a task)
  if (
    /(?:rs\.?|inr|usd|eur|gbp|\$|₹|€|£)\s?[\d,]+(?:\.\d{1,2})?\s*(?:has been |was |is )?(?:debited|credited|withdrawn|deposited|spent|received|transferred|refunded)\b/i.test(
      lower
    ) ||
    /\b(?:debited|credited)\b[^.]{0,40}(?:rs\.?|inr|\$|₹)\s?[\d,]+/i.test(lower) ||
    /\b(?:txn|transaction|payment) (?:of |id |ref |successful|completed|received|done)\b/i.test(
      lower
    ) ||
    /\b(?:upi|imps|neft|rtgs|paytm|gpay|phonepe)\b[^.]{0,30}\b(?:received|sent|successful|credited|debited)\b/i.test(
      lower
    )
  ) {
    return { force: true, reason: 'ANTI_PATTERN', signal: 'transaction_alert' };
  }

  // Order / shipment status updates (informational)
  if (
    /\b(?:your order|order #?\d|order id|tracking (?:id|number)|shipment|package|parcel|delivery)\b[^.]{0,80}\b(?:dispatched|shipped|delivered|out for delivery|in transit|arriving|has arrived|on its way|picked up)\b/i.test(
      lower
    ) ||
    /\b(?:expected|estimated) delivery\b/i.test(lower) ||
    /\bhas been (?:delivered|shipped|dispatched)\b/i.test(lower)
  ) {
    return { force: true, reason: 'ANTI_PATTERN', signal: 'shipment_status' };
  }

  // Promotional / marketing
  if (
    /\b(?:\d{1,3}%\s*off|flat\s*\d{1,3}%|upto\s*\d{1,3}%|limited[- ]time|exclusive offer|mega sale|sale ends|hurry|last chance|buy now|shop now|order now|grab (?:it|now|yours)|use code\s*[a-z0-9]+|coupon code|cashback|lowest price|deal of the day)\b/i.test(
      lower
    ) ||
    /\b(?:click here|tap (?:here|to (?:view|claim|open|shop|see))|download now|install now|subscribe now|learn more →)\b/i.test(
      lower
    )
  ) {
    return { force: true, reason: 'ANTI_PATTERN', signal: 'promotional' };
  }

  // News headlines / live updates / sports scores
  if (
    /^(?:breaking|live|just in|exclusive|news|update|alert)\s*[:|-]/i.test(lower) ||
    /\b\d{1,3}\s*[-/]\s*\d{1,3}\b[^.]{0,30}\b(?:vs\.?|innings|wickets?|runs?|goals?|sets?|quarter|fulltime|half[- ]time)\b/i.test(
      lower
    ) ||
    /\b(?:match|test|odi|t20|ipl|premier league)\b[^.]{0,40}\b(?:won by|beat|defeated|drew|live score)\b/i.test(
      lower
    )
  ) {
    return { force: true, reason: 'ANTI_PATTERN', signal: 'news_or_sports' };
  }

  return NO_DISCARD;
}

// ── URL helper ─────────────────────────────────────────────────────────────────

function hasUrl(text: string): boolean {
  return /\bhttps?:\/\/|\bwww\.|\b\S+\.(?:com|in|org|net|io|co|ly|app)\b/i.test(text);
}

const ACTION_VERBS =
  'send|share|submit|review|check|call|update|prepare|confirm|fill|upload|forward|reply|provide|schedule|fix|complete|attend|join|arrange|handle|ensure|finalize|approve|sign|book|pay|order|email|draft|verify|coordinate|follow up';

// ── Priority derivation ───────────────────────────────────────────────────────

function derivePriority(score: number, signals: string[]): 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const hasDeadline = signals.includes('deadline_en') || signals.includes('deadline_hi');
  const hasFinancial = signals.includes('financial_urgency');
  const hasImperative =
    signals.includes('direct_imperative_en') ||
    signals.includes('direct_hi_verb') ||
    signals.includes('hinglish_action');
  const hasScheduleChange = signals.includes('schedule_change');
  if ((hasDeadline || hasFinancial) && score >= 0.6) return 'URGENT';
  if ((hasDeadline || hasFinancial) && score >= 0.35) return 'HIGH';
  if (hasImperative && score >= 0.5) return 'HIGH';
  if (hasScheduleChange && score >= 0.4) return 'HIGH';
  if (signals.includes('at_mention_specific') || signals.includes('approval_request'))
    return 'HIGH';
  if (score >= 0.65) return 'HIGH';
  if (score >= 0.38) return 'MEDIUM';
  return 'LOW';
}

// ── Signal evaluation ─────────────────────────────────────────────────────────

interface SignalAccumulator {
  score: number;
  signals: string[];
}

function applySignal(acc: SignalAccumulator, name: string, weight: number): void {
  acc.score += weight;
  acc.signals.push(name);
}

function evalPositiveSignals(
  acc: SignalAccumulator,
  latestMessage: string,
  fullText: string,
  tier: Tier,
  activeKws: ActiveKw[],
  hasThreadContext: boolean
): void {
  const wc = wordCount(latestMessage);

  // direct_imperative_en
  if (
    /\b(please|pls|kindly)\b.{0,80}(send|share|submit|review|check|call|update|prepare|confirm|fill|upload|forward|reply|provide|schedule|fix|complete|attend|join|arrange|handle|ensure)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'direct_imperative_en', 0.45);
  }

  // direct_hi_verb
  if (
    /\b(bhej do|bhej dena|dekh lo|dekh lena|kar do|kar dena|bata do|bata dena|de do|dena|aa jao|aa jana|call kar|check kar|share kar|submit kar|forward kar|jama kar|bhar do)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'direct_hi_verb', 0.45);
  }

  // schedule_change
  if (
    /\b(cancelled|cancel|called off|postponed|rescheduled|moved to|meeting off|won't happen|not happening|no longer|skip today|cancel ho gaya|nahi hoga|rehne do|hone wala nahi|band kar do)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'schedule_change', 0.4);
  }

  // deadline_en
  if (
    /\b(today|tonight|tomorrow|asap|eod|cob|end of day|monday|tuesday|wednesday|thursday|friday|saturday|sunday|this week|next week)\b/i.test(
      latestMessage
    ) ||
    /\b(?:by|before|till?)\s+(?:the\s+)?\d{1,2}(?:st|nd|rd|th)\b/i.test(latestMessage) ||
    /\b(?:by|before|at)\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(latestMessage) ||
    /\b(?:by|before|on)\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(
      latestMessage
    ) ||
    /\bin \d+ (?:hour|day)/i.test(latestMessage)
  ) {
    applySignal(acc, 'deadline_en', 0.35);
  }

  // opinion_request_vip — only VIP_PERSONAL or VIP_WORK
  if (
    (tier === 'VIP_PERSONAL' || tier === 'VIP_WORK') &&
    /\b(what do you think|thik hai kya|kaisa hai|batao kaisa|check karke bata|theek lagta hai|acha hai kya|lena chahiye kya)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'opinion_request_vip', 0.35);
  }

  // personal_obligation_vip — only VIP_PERSONAL
  if (
    tier === 'VIP_PERSONAL' &&
    /\b(aa jao|ghar aa|aa ja|jaldi aa|aa jao na|kab aa rahe|aa jao abhi)\b/i.test(latestMessage)
  ) {
    applySignal(acc, 'personal_obligation_vip', 0.35);
  }

  // at_mention_specific
  if (/@rishabh/i.test(latestMessage) || /^rishabh[,:]/i.test(latestMessage.trimStart())) {
    applySignal(acc, 'at_mention_specific', 0.35);
  }

  // reportee_decision_ask — only WORK
  if (
    tier === 'WORK' &&
    /\b(do we .{0,40}\?|should (i|we) .{0,40}\?|kya main .{0,30}\?|karun ya .{0,20}\?)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'reportee_decision_ask', 0.3);
  }

  // role_addressed
  if (
    /\b(dear pm|dear pms|dear tech lead|project manager|pm team|all pms|all tech|program manager)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'role_addressed', 0.3);
  }

  // bare_imperative_hi
  if (
    wc <= 8 &&
    /\b(dekho|bhejo|karo|batao|bolo|aao|jao|bhejo|padho|likho|check karo|call karo)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'bare_imperative_hi', 0.3);
  }

  // personal_name_in_body
  if (/\brishabh\b/i.test(latestMessage)) {
    applySignal(acc, 'personal_name_in_body', 0.25);
  }

  // group_compliance_check (uses fullText)
  if (
    /\b(most (teams|projects|members)|all (except|but)|yet to|pending from|still not|haven't (shared|submitted|sent))\b/i.test(
      fullText
    )
  ) {
    applySignal(acc, 'group_compliance_check', 0.25);
  }

  // managerial_awareness
  if (
    (tier === 'WORK' || tier === 'VIP_WORK') &&
    /@[A-Za-z]+/.test(latestMessage) &&
    /\b(send|share|submit|review|check|call|update|prepare|confirm|fill|upload|forward|reply|provide|schedule|fix|complete|attend|join|arrange|handle|ensure)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'managerial_awareness', 0.2);
  }

  // learned_keyword_match (positive, up to 2 distinct matches, each capped at +0.15)
  let matchApplied = 0;
  const seenMatch = new Set<string>();
  for (const kw of activeKws) {
    if (matchApplied >= 2) break;
    const ngram = kw.ngram.toLowerCase();
    if (kw.weight > 0 && !seenMatch.has(ngram) && latestMessage.toLowerCase().includes(ngram)) {
      seenMatch.add(ngram);
      applySignal(acc, 'learned_keyword_match', Math.min(kw.weight, 0.15));
      matchApplied += 1;
    }
  }

  // thread_context_boost
  if (hasThreadContext) {
    applySignal(acc, 'thread_context_boost', 0.2);
  }

  // deadline_hi — stronger Hindi deadline signals
  if (
    /\b(aaj tak|aaj hi|kal tak|abhi|jaldi karo|is hafte|agle hafte|turant|jaldi|abhi bhejo|aaj bhejna)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'deadline_hi', 0.25);
  } else if (/\b(aaj|kal)\b/i.test(latestMessage)) {
    applySignal(acc, 'deadline_hi', 0.12);
  }

  // financial_urgency — payment, invoice, bill alerts
  if (
    /\b(payment due|invoice|overdue|bill due|emi due|outstanding|pay now|clear dues|amount due|last date|due date|payment pending|unpaid)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'financial_urgency', 0.35);
  }

  // meeting_invite — calendar/meeting actions
  if (
    /\b(meeting|call scheduled|stand-?up|sync|interview|demo scheduled|team call|1:1|one.on.one|zoom|meet\.google)\b/i.test(
      latestMessage
    ) &&
    /\b(join|accept|decline|respond|rsvp|confirm attendance|attending)\b/i.test(latestMessage)
  ) {
    applySignal(acc, 'meeting_invite', 0.3);
  }

  // approval_request
  if (
    /\b(approve|approval needed|waiting for your approval|please approve|sign off|sanction|authorize|authorize this|needs your ok)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'approval_request', 0.3);
  }

  // hinglish_action — Hindi verb suffix attached to English action word
  // e.g. "send kar do", "review kar lo", "submit karna", "share karo"
  if (
    new RegExp(
      `\\b(${ACTION_VERBS})\\s+(kar\\s?(do|lo|na|dena|len?a|o)|kr\\s?do|krna)\\b`,
      'i'
    ).test(latestMessage)
  ) {
    applySignal(acc, 'hinglish_action', 0.4);
  }

  // polite_request — softened imperative phrasing
  if (
    new RegExp(
      `\\b(can you|could you|would you (mind|be able)|are you able to|when you get a chance|whenever you can|if possible)\\b.{0,60}\\b(${ACTION_VERBS})\\b`,
      'i'
    ).test(latestMessage)
  ) {
    applySignal(acc, 'polite_request', 0.25);
  }

  // compound_action — two or more distinct action verbs (multi-step ask)
  {
    const verbMatches = latestMessage
      .toLowerCase()
      .match(new RegExp(`\\b(${ACTION_VERBS})\\b`, 'g'));
    const distinct = new Set(verbMatches ?? []);
    if (distinct.size >= 2) {
      applySignal(acc, 'compound_action', 0.15);
    }
  }

  // quoted_reply — replying to a prior message (WhatsApp/Slack quote block)
  if (/(^|\n)\s*>\s?\S/.test(latestMessage) || /\breplying to\b/i.test(latestMessage)) {
    applySignal(acc, 'quoted_reply', 0.15);
  }

  // number_quantifier — concrete quantity tied to an action ("send 3 files")
  if (
    new RegExp(`\\b(${ACTION_VERBS})\\b.{0,20}\\b\\d{1,4}\\b`, 'i').test(latestMessage) ||
    /\bby \d{1,2}(?::\d{2})?\s*(?:am|pm)\b/i.test(latestMessage)
  ) {
    applySignal(acc, 'number_quantifier', 0.1);
  }

  // question_mark
  if (latestMessage.trimEnd().endsWith('?')) {
    applySignal(acc, 'question_mark', 0.08);
  }
}

// ── Length-based prior ─────────────────────────────────────────────────────────
// Very short messages need an explicit action signal to be credible; very long
// messages are usually forwards/newsletters. Applied after all other signals.

function applyLengthPrior(acc: SignalAccumulator, latestMessage: string): void {
  const wc = wordCount(latestMessage);
  const hasActionSignal = acc.signals.some(
    (s) =>
      s === 'direct_imperative_en' ||
      s === 'direct_hi_verb' ||
      s === 'hinglish_action' ||
      s === 'bare_imperative_hi' ||
      s === 'polite_request' ||
      s === 'approval_request' ||
      s === 'meeting_invite'
  );
  // 1-2 word message with no explicit action → likely a greeting/reaction
  if (wc <= 2 && !hasActionSignal) {
    applySignal(acc, 'too_terse', -0.2);
  }
  // 60-150 word message with no action verb → likely informational/forward
  if (wc >= 60 && wc <= 150 && !hasActionSignal) {
    applySignal(acc, 'verbose_informational', -0.15);
  }
}

function evalNegativeSignals(
  acc: SignalAccumulator,
  latestMessage: string,
  activeKws: ActiveKw[]
): void {
  const wc = wordCount(latestMessage);

  // did_you_receive
  if (
    /\b(did you (get|receive|see|check)|have you (received|seen|got)|kya mila|mila kya|dekha kya|mili kya)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'did_you_receive', -0.4);
  }

  // inbound_knowledge_question
  if (
    /\b(how (do|does|can|should) (i|we)|what is the (process|procedure|way)|kaise (karte|karen|karein)|how to)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'inbound_knowledge_question', -0.3);
  }

  // achievement_announcement
  if (
    /\b(delighted to (share|announce|inform)|pleased to (share|announce)|proud to (present|share)|happy to announce)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'achievement_announcement', -0.4);
  }

  // newsletter_broadcast
  if (/\b(monthly newsletter|weekly digest|edition|roundup|bulletin)\b/i.test(latestMessage)) {
    applySignal(acc, 'newsletter_broadcast', -0.4);
  }

  // casual_social
  if (
    wc <= 15 &&
    /\b(kya hua|sab theek|kaise ho|how are you|all good|what's up|dekha)\b/i.test(latestMessage)
  ) {
    applySignal(acc, 'casual_social', -0.35);
  }

  // long_forwarded
  if (wc > 150) {
    applySignal(acc, 'long_forwarded', -0.5);
  }

  // negation_action — explicit cancellation of an action ("don't send", "no need to")
  if (
    new RegExp(
      `\\b(don'?t|do not|no need to|need not|please (?:don'?t|do not)|mat\\b|nahi\\b|na karna|rehne do|chhod do)\\b.{0,30}\\b(${ACTION_VERBS}|karo|karna|bhejo|bhejna)\\b`,
      'i'
    ).test(latestMessage)
  ) {
    applySignal(acc, 'negation_action', -0.35);
  }

  // self_completed — sender reporting THEY already did it (past tense / future self)
  if (
    /\b(i (?:have |'ve )?(?:already )?(?:sent|shared|submitted|done|completed|finished|forwarded|updated|fixed|handled)|i'?ll (?:send|share|do|handle|take care)|i will (?:send|share|do|handle)|main (?:bhej|kar) (?:diya|dunga|dungi|diya hai)|bhej diya|kar diya|ho gaya mera)\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'self_completed', -0.35);
  }

  // auto_reply — out-of-office / automated acknowledgement
  if (
    /\b(out of (?:office|the office)|on (?:leave|vacation|holiday)|away from my desk|will (?:get back|revert|respond) (?:to you )?(?:soon|shortly|asap)|auto[- ]?reply|automatic reply|currently unavailable|thank you for (?:your )?(?:email|message), )\b/i.test(
      latestMessage
    )
  ) {
    applySignal(acc, 'auto_reply', -0.4);
  }

  // forward_chain — forwarded email/message header
  if (
    /^\s*(?:fw|fwd|forwarded)\s*:/i.test(latestMessage) ||
    /-{3,}\s*forwarded message/i.test(latestMessage)
  ) {
    applySignal(acc, 'forward_chain', -0.3);
  }

  // link_share — short message dominated by a URL (article / link drop)
  if (wc <= 12 && hasUrl(latestMessage)) {
    const withoutUrl = latestMessage.replace(/\bhttps?:\/\/\S+/gi, '').trim();
    if (wordCount(withoutUrl) <= 6) {
      applySignal(acc, 'link_share', -0.25);
    }
  }

  // learned_keyword_reject (negative, up to 2 distinct matches, total capped at -0.30)
  let rejectApplied = 0;
  const seenReject = new Set<string>();
  for (const kw of activeKws) {
    if (rejectApplied >= 2) break;
    const ngram = kw.ngram.toLowerCase();
    if (kw.weight < 0 && !seenReject.has(ngram) && latestMessage.toLowerCase().includes(ngram)) {
      seenReject.add(ngram);
      const weight = Math.max(kw.weight, -0.15);
      applySignal(acc, 'learned_keyword_reject', weight);
      rejectApplied += 1;
    }
  }
}

// ── Per-app signal profile ────────────────────────────────────────────────────
// Different apps have different noise floors. Formal channels (Gmail, Outlook)
// lean task-heavy; social/messaging apps are noisy. Group chats add extra noise.

function appScoreModifier(packageName: string, isGroup: boolean): number {
  const groupPenalty = isGroup ? -0.05 : 0;
  switch (packageName) {
    case 'com.google.android.gm': // Gmail — formal work email
    case 'com.microsoft.outlook':
    case 'com.microsoft.exchange.mowa': // Outlook mobile
      return 0.08;
    case 'com.Slack': // Slack — work context
    case 'com.microsoft.teams':
    case 'com.microsoft.skype.teams':
      return 0.05;
    case 'com.whatsapp': // WhatsApp — high volume, conversational
    case 'org.telegram.messenger':
    case 'org.thoughtcrime.securesms': // Signal
      return -0.05 + groupPenalty;
    case 'com.android.mms': // SMS — often transactional/OTP
    case 'com.google.android.apps.messaging':
      return -0.1;
    case 'com.linkedin.android': // Social / news feeds — low task density
    case 'com.instagram.android':
    case 'com.facebook.katana':
    case 'com.twitter.android':
    case 'com.snapchat.android':
      return -0.15;
    default:
      return 0;
  }
}

// ── Always inbox (force CONFIRM) ─────────────────────────────────────────────

function checkForceInbox(
  latestMessage: string,
  signals: string[],
  effectiveTrust: number
): boolean {
  // status_update_with_tag
  if (
    /\b(worked on|completed|done|finished|submitted|sent already)\b/i.test(latestMessage) &&
    /@/.test(latestMessage)
  ) {
    return true;
  }
  // group_compliance_check
  if (signals.includes('group_compliance_check')) return true;
  // role_addressed + low trust
  if (signals.includes('role_addressed') && effectiveTrust < 0.8) return true;
  return false;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function scoreNotification(notification: NotificationData): Promise<ScoringResult> {
  const latestMessage = (
    notification.bigText ||
    notification.text ||
    notification.title ||
    ''
  ).trim();

  // ── Force discard — definitive non-tasks bypass scoring entirely ─────────────
  const forced = checkForceDiscard(latestMessage, notification.packageName);
  if (forced.force) {
    return {
      score: 0,
      ruleScore: 0,
      modelScore: null,
      decision: 'DISCARD',
      forceInbox: false,
      signals: [forced.signal],
      priority: 'LOW',
      extractedDeadline: null,
      discardReason: forced.reason,
    };
  }

  const threadText = (notification.thread ?? []).map((m) => m.text).join(' ');
  const fullText = `${latestMessage} ${threadText}`;

  const senderKey = buildSenderKey(notification.packageName, notification.title ?? '');

  const [senderInfo, activeKws, hasThreadCtx] = await Promise.all([
    loadSenderInfo(senderKey),
    loadActiveKeywords(),
    hasRecentThreadTask(notification.title ?? '', notification.packageName),
  ]);

  const acc: SignalAccumulator = { score: 0, signals: [] };

  evalPositiveSignals(acc, latestMessage, fullText, senderInfo.tier, activeKws, hasThreadCtx);
  evalNegativeSignals(acc, latestMessage, activeKws);
  applyLengthPrior(acc, latestMessage);

  const appMod = appScoreModifier(notification.packageName, notification.isGroup ?? false);
  if (appMod !== 0) {
    applySignal(acc, appMod > 0 ? 'app_profile_boost' : 'app_profile_penalty', appMod);
  }

  const rawScore = Math.max(0, Math.min(1, acc.score));

  // ── On-device intent model (optional second pass) ─────────────────────────
  const modelWeight = getSetting('model_weight');
  let modelScore: number | null = null;
  let finalScore = rawScore;

  if (modelWeight > 0) {
    try {
      const model = await loadModel();
      if (model.version !== '0.0.0' && model.weights.length > 0) {
        modelScore = runInference(latestMessage, model);
        // Linear blend: finalScore = ruleScore*(1-w) + modelScore*w
        finalScore = rawScore * (1 - modelWeight) + modelScore * modelWeight;
        finalScore = Math.max(0, Math.min(1, finalScore));
        acc.signals.push(modelScore >= 0.5 ? 'model_positive' : 'model_negative');
      }
    } catch {
      /* model inference failed — rule-only fallback */
    }
  }

  const forceInbox = checkForceInbox(latestMessage, acc.signals, senderInfo.effectiveTrust);

  let decision: 'CREATE' | 'CONFIRM' | 'DISCARD';
  if (senderInfo.isUnknown || forceInbox) {
    decision = 'CONFIRM';
  } else if (finalScore >= senderInfo.thresholds.createThreshold) {
    decision = 'CREATE';
  } else if (finalScore <= senderInfo.thresholds.discardThreshold) {
    decision = 'DISCARD';
  } else {
    decision = 'CONFIRM';
  }

  const priority = derivePriority(finalScore, acc.signals);
  const extractedDeadline = extractDeadline(latestMessage);

  return {
    score: finalScore,
    ruleScore: rawScore,
    modelScore,
    decision,
    forceInbox,
    signals: acc.signals,
    priority,
    extractedDeadline,
    discardReason: decision === 'DISCARD' ? 'LOW_CONFIDENCE' : null,
  };
}
