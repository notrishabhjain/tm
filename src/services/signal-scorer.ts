import { eq, and, isNull, gt } from 'drizzle-orm';
import { db } from '@/data/db/client';
import { tasks, senderStats, learnedKeywords } from '@/data/db/schema';
import type { NotificationData } from '../../modules/notification-listener/src/types';

export interface ScoringResult {
  score: number;
  decision: 'CREATE' | 'CONFIRM' | 'DISCARD';
  forceInbox: boolean;
  signals: string[];
  priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';
  extractedDeadline: number | null;
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

// ── Priority derivation ───────────────────────────────────────────────────────

function derivePriority(score: number, signals: string[]): 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' {
  const hasDeadline = signals.includes('deadline_en') || signals.includes('deadline_hi');
  const hasFinancial = signals.includes('financial_urgency');
  const hasImperative =
    signals.includes('direct_imperative_en') || signals.includes('direct_hi_verb');
  const hasScheduleChange = signals.includes('schedule_change');
  if ((hasDeadline || hasFinancial) && score >= 0.6) return 'URGENT';
  if ((hasDeadline || hasFinancial) && score >= 0.35) return 'HIGH';
  if (hasImperative && score >= 0.5) return 'HIGH';
  if (hasScheduleChange && score >= 0.4) return 'HIGH';
  if (signals.includes('at_mention_specific')) return 'HIGH';
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

  // learned_keyword_match (positive, capped at +0.20)
  for (const kw of activeKws) {
    if (kw.weight > 0 && latestMessage.toLowerCase().includes(kw.ngram.toLowerCase())) {
      const weight = Math.min(kw.weight, 0.2);
      applySignal(acc, 'learned_keyword_match', weight);
      break; // apply once per signal name (first match)
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

  // question_mark
  if (latestMessage.trimEnd().endsWith('?')) {
    applySignal(acc, 'question_mark', 0.08);
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

  // learned_keyword_reject (negative, capped at -0.20)
  for (const kw of activeKws) {
    if (kw.weight < 0 && latestMessage.toLowerCase().includes(kw.ngram.toLowerCase())) {
      const weight = Math.max(kw.weight, -0.2);
      applySignal(acc, 'learned_keyword_reject', weight);
      break;
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
  };
}
