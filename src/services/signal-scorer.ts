import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { tasks, senderStats, learnedKeywords } from '@/data/db/schema';
import type { DiscardReason } from '@/domain/types';
import type { NotificationData } from '../../modules/notification-listener/src/types';

export interface ScoringResult {
  score: number;
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
  const now = Date.now();
  const deadlines: number[] = [];

  const endOfToday = (): number => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };

  const nextWeekday = (name: string): number => {
    const days: Record<string, number> = {
      sunday: 0,
      monday: 1,
      tuesday: 2,
      wednesday: 3,
      thursday: 4,
      friday: 5,
      saturday: 6,
    };
    const target = days[name];
    if (target === undefined) return 0;
    const d = new Date();
    const diff = (target - d.getDay() + 7) % 7 || 7;
    d.setDate(d.getDate() + diff);
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  };

  if (/\btomorrow\b/.test(lower)) deadlines.push(now + 86_400_000);
  if (/\b(today|tonight|eod|cob|end of day)\b/.test(lower)) deadlines.push(endOfToday());
  if (/\basap\b/.test(lower)) deadlines.push(now + 3_600_000);

  const hoursMatch = lower.match(/\bin (\d+) hours?\b/);
  if (hoursMatch) deadlines.push(now + parseInt(hoursMatch[1], 10) * 3_600_000);

  const daysMatch = lower.match(/\bin (\d+) days?\b/);
  if (daysMatch) deadlines.push(now + parseInt(daysMatch[1], 10) * 86_400_000);

  for (const day of [
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday',
  ]) {
    if (lower.includes(day)) {
      const ts = nextWeekday(day);
      if (ts > 0) deadlines.push(ts);
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
    /\b(today|tonight|tomorrow|asap|eod|cob|end of day|by \d|monday|tuesday|wednesday|thursday|friday|in \d+ (hour|day)|this week|next week)\b/i.test(
      latestMessage
    )
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

  const rawScore = Math.max(0, Math.min(1, acc.score));
  const forceInbox = checkForceInbox(latestMessage, acc.signals, senderInfo.effectiveTrust);

  let decision: 'CREATE' | 'CONFIRM' | 'DISCARD';
  if (senderInfo.isUnknown || forceInbox) {
    decision = 'CONFIRM';
  } else if (rawScore >= senderInfo.thresholds.createThreshold) {
    decision = 'CREATE';
  } else if (rawScore <= senderInfo.thresholds.discardThreshold) {
    decision = 'DISCARD';
  } else {
    decision = 'CONFIRM';
  }

  const priority = derivePriority(rawScore, acc.signals);
  const extractedDeadline = extractDeadline(latestMessage);

  return {
    score: rawScore,
    decision,
    forceInbox,
    signals: acc.signals,
    priority,
    extractedDeadline,
    discardReason: decision === 'DISCARD' ? 'LOW_CONFIDENCE' : null,
  };
}
