import type { NotificationData } from '../../modules/notification-listener/src/types';
import NotificationListener from '../../modules/notification-listener/src';
import { db, initializeDatabase } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { SenderStatsRepository } from '@/data/repositories/SenderStatsRepository';
import { LearnedKeywordRepository } from '@/data/repositories/LearnedKeywordRepository';
import { logCapturedNotification, logExtractionDecision } from './diagnostics-logger';
import { extractNgrams, languageForText } from './ngram-extractor';
import { scoreNotification, buildSenderKey } from './signal-scorer';
import { resolveCancellation } from './cancellation-resolver';
import { extractTitle } from './title-extractor';
import { getSetting } from '@/data/storage/settings';

// Returns true if the current local time falls within user-configured quiet hours.
function isQuietHours(): boolean {
  try {
    const start = getSetting('quiet_hours_start'); // "HH:MM"
    const end = getSetting('quiet_hours_end');
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    const now = new Date();
    const cur = now.getHours() * 60 + now.getMinutes();
    const s = sh * 60 + sm;
    const e = eh * 60 + em;
    return s > e ? cur >= s || cur < e : cur >= s && cur < e; // handles midnight crossing
  } catch {
    return false;
  }
}

// Jaccard similarity on word tokens — used for near-duplicate task detection.
function titleSimilarity(a: string, b: string): number {
  const tokens = (s: string): Set<string> =>
    new Set(
      s
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .split(/\s+/)
        .filter(Boolean)
    );
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  const intersection = [...ta].filter((x) => tb.has(x)).length;
  return intersection / (ta.size + tb.size - intersection);
}

export async function handleNotification(taskData: {
  notification: NotificationData;
}): Promise<void> {
  const { notification } = taskData;

  initializeDatabase();

  // ── App filter ───────────────────────────────────────────────────────────────
  const monitoredRepo = new MonitoredAppRepository(db);
  const activePackages = await monitoredRepo.getActivePackageNames();
  if (activePackages.length > 0 && !activePackages.includes(notification.packageName)) {
    logCapturedNotification(notification, 'FILTERED');
    return;
  }
  logCapturedNotification(notification, 'PASSED');

  // ── VIP fast-path ────────────────────────────────────────────────────────────
  const vipRepo = new VipContactRepository(db);
  const allVipIds = await vipRepo.getAllIdentifiers();
  const senderText = `${notification.title ?? ''} ${notification.text ?? ''}`;
  const isVip =
    allVipIds.length > 0 &&
    allVipIds.some((vip) => senderText.toLowerCase().includes(vip.toLowerCase()));

  if (isVip) {
    const taskRepo = new TaskRepository(db);
    const messageText = notification.bigText || notification.text || notification.title;
    const title = extractTitle(messageText, notification.title ?? '', notification.packageName);
    await taskRepo.createTask({
      title,
      body: notification.bigText || notification.text,
      sourceApp: notification.packageName,
      sender: notification.title,
      priority: 'URGENT',
      confidence: 1.0,
      needsConfirmation: false,
      matchedKeywords: ['vip_contact'],
      language: 'EN',
      createdAt: notification.postTime || Date.now(),
    });
    logExtractionDecision({
      input: messageText,
      language: 'EN',
      ruleScore: 1.0,
      modelScore: 0,
      finalScore: 1.0,
      matchedKeywords: ['vip_contact'],
      decision: 'CREATE',
      timestamp: Date.now(),
    });
    await refreshPersistentNotification(new TaskRepository(db));
    return;
  }

  // ── Cancellation resolver ────────────────────────────────────────────────────
  const wasCancellation = await resolveCancellation(notification);
  if (wasCancellation) {
    logCapturedNotification(notification, 'FILTERED');
    return;
  }

  // ── Signal scorer ────────────────────────────────────────────────────────────
  const result = await scoreNotification(notification);

  logExtractionDecision({
    input: notification.bigText || notification.text,
    language: 'EN',
    ruleScore: result.ruleScore,
    modelScore: result.modelScore ?? 0,
    finalScore: result.score,
    matchedKeywords: result.signals,
    decision: result.decision,
    timestamp: Date.now(),
  });

  const taskRepo = new TaskRepository(db);
  const senderStatsRepo = new SenderStatsRepository(db);
  const senderKey = buildSenderKey(notification.packageName, notification.title ?? '');

  if (result.decision === 'DISCARD') {
    const discardedRepo = new DiscardedLogRepository(db);
    await discardedRepo.insert({
      notificationId: `${notification.packageName}-${notification.postTime}`,
      sourceApp: notification.packageName,
      sender: notification.title,
      bodyPreview: (notification.bigText || notification.text).slice(0, 100),
      reason: result.discardReason ?? 'LOW_CONFIDENCE',
      confidence: result.score,
      createdAt: Date.now(),
    });
    await refreshPersistentNotification(taskRepo);
    return;
  }

  // ── Deduplicate against recent tasks ─────────────────────────────────────────
  const candidateTitle = extractTitle(
    notification.bigText || notification.text,
    notification.title ?? '',
    notification.packageName
  );

  if (notification.title) {
    try {
      const recent = await taskRepo.getRecentBySenderAndApp(
        notification.title,
        notification.packageName
      );
      if (recent.some((t) => titleSimilarity(t.title, candidateTitle) >= 0.7)) {
        logCapturedNotification(notification, 'FILTERED');
        return;
      }
    } catch {
      /* non-fatal — dedup is best-effort */
    }
  }

  // ── Create task ──────────────────────────────────────────────────────────────
  const quietHours = isQuietHours();
  const urgentOverride = getSetting('urgent_override_quiet');
  const demoteToConfirm =
    quietHours && result.decision === 'CREATE' && !(urgentOverride && result.priority === 'URGENT');
  const needsConfirmation = result.decision === 'CONFIRM' || demoteToConfirm;
  const matchedKeywords = demoteToConfirm
    ? [...result.signals, 'quiet_hours_demotion']
    : result.signals;

  await taskRepo.createTask({
    title: candidateTitle,
    body: notification.bigText || notification.text,
    sourceApp: notification.packageName,
    sender: notification.title,
    priority: result.priority,
    confidence: result.score,
    needsConfirmation,
    matchedKeywords,
    language: 'EN',
    dueDate: result.extractedDeadline ?? null,
    createdAt: notification.postTime || Date.now(),
  });

  if (!needsConfirmation) {
    await senderStatsRepo.incrementAutoAccept(senderKey);

    // N-gram learning
    const learnedRepo = new LearnedKeywordRepository(db);
    const text = notification.bigText || notification.text;
    const ngrams = extractNgrams(text, 'EN');
    if (ngrams.length > 0) {
      try {
        await learnedRepo.recordNgrams(ngrams, languageForText('EN'));
      } catch {
        /* non-fatal */
      }
    }
  }

  await refreshPersistentNotification(taskRepo);
}

async function refreshPersistentNotification(taskRepo: TaskRepository): Promise<void> {
  try {
    const pending = await taskRepo.getPendingTasks();
    const urgent = pending.filter((t) => t.priority === 'URGENT');
    await NotificationListener.updatePersistentNotification({
      pendingCount: pending.length,
      urgentCount: urgent.length,
      topTaskText: pending[0]?.title ?? '',
      secondTaskText: pending[1]?.title ?? null,
    });
  } catch {
    /* ForegroundService may not be running — non-fatal */
  }
}
