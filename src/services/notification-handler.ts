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
    ruleScore: result.score,
    modelScore: 0,
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

  // ── Create task ──────────────────────────────────────────────────────────────
  const needsConfirmation = result.decision === 'CONFIRM';
  await taskRepo.createTask({
    title: candidateTitle,
    body: notification.bigText || notification.text,
    sourceApp: notification.packageName,
    sender: notification.title,
    priority: result.priority,
    confidence: result.score,
    needsConfirmation,
    matchedKeywords: result.signals,
    language: 'EN',
    dueDate: result.extractedDeadline ?? null,
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
