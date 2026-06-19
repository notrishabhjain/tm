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
import { classifyNotification } from './ai-classifier';
import { createGoogleTask } from './google-tasks';
import { appDisplayName } from './app-name-map';
import { getSetting } from '@/data/storage/settings';

// In-memory guard: prevents concurrent processing of the same notification when Android
// re-delivers it before the first DB write completes (common with messaging apps).
const _inFlight = new Set<string>();

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

// Returns true when a near-identical task was already created from the same app
// within the last 10 minutes — catches the WhatsApp "unread + new message fires
// old notification again" pattern and Android group-summary re-deliveries.
async function isContentDuplicate(
  candidateTitle: string,
  sourceApp: string,
  taskRepo: TaskRepository
): Promise<boolean> {
  try {
    const recent = await taskRepo.getRecentBySourceApp(sourceApp);
    return recent.some((t) => titleSimilarity(t.title, candidateTitle) >= 0.85);
  } catch {
    return false; // best-effort — never block on dedup failure
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

  // ── In-memory in-flight guard (synchronous, prevents race conditions) ────────
  // Key is notificationKey-only (no content slice) so that re-deliveries with
  // updated content — e.g. WhatsApp updating a thread notification when a new
  // message arrives — are blocked for 60 s, not just identical re-deliveries.
  const inFlightKey = notification.notificationKey
    ? notification.notificationKey
    : `${notification.packageName}:${notification.postTime}`;
  if (_inFlight.has(inFlightKey)) return;
  _inFlight.add(inFlightKey);

  try {
    await _handleNotification(notification);
    // Keep the key for 60 s to absorb late re-deliveries, then clean up.
    setTimeout(() => _inFlight.delete(inFlightKey), 60_000);
  } catch {
    // Processing failed (transient DB/network error). Release the key immediately
    // so an Android re-delivery can retry instead of being suppressed for 60 s.
    _inFlight.delete(inFlightKey);
  }
}

// Newest MessagingStyle thread message timestamp, 0 if no thread data.
function latestThreadTimestamp(notification: NotificationData): number {
  if (!Array.isArray(notification.thread)) return 0;
  let max = 0;
  for (const m of notification.thread) {
    const ts =
      typeof (m as { timestamp?: unknown }).timestamp === 'number'
        ? (m as { timestamp: number }).timestamp
        : 0;
    if (ts > max) max = ts;
  }
  return max;
}

async function _handleNotification(notification: NotificationData): Promise<void> {
  // ── Notification-key deduplication (DB-level) ───────────────────────────────
  // Key-only check: if we already created or discarded a task for this
  // notification key, skip — UNLESS the notification carries a MessagingStyle
  // thread whose newest message is newer than that record. Messaging apps reuse
  // one notification key per conversation, so without the thread-timestamp
  // escape hatch a single processed message would permanently mute the chat.
  // Plain re-deliveries keep their old thread timestamps and stay blocked.
  if (notification.notificationKey) {
    const taskRepo = new TaskRepository(db);
    const discardedRepo = new DiscardedLogRepository(db);
    const [existingTask, existingDiscard] = await Promise.all([
      taskRepo.findByNotificationKey(notification.notificationKey),
      discardedRepo.findByNotificationKey(notification.notificationKey),
    ]);
    const lastMsgTs = latestThreadTimestamp(notification);
    const blockedByTask = existingTask !== null && lastMsgTs <= existingTask.createdAt;
    const blockedByDiscard = existingDiscard !== null && lastMsgTs <= existingDiscard.createdAt;
    if (blockedByTask || blockedByDiscard) {
      logCapturedNotification(notification, 'FILTERED');
      return;
    }
  }

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
    // VIP contacts are an explicit user allowlist — they always create a task.
    // When Cloud AI is enabled we still pass the message through it to get a
    // cleaner title / smarter priority, but we never let AI suppress a VIP.
    let title = extractTitle(messageText, notification.title ?? '', notification.packageName);
    if (await isContentDuplicate(title, notification.packageName, taskRepo)) {
      logCapturedNotification(notification, 'FILTERED');
      await refreshPersistentNotification(taskRepo);
      return;
    }
    let priority: 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW' = 'URGENT';
    let dueDate: number | null = null;
    const aiActive = Boolean(getSetting('ai_enabled') && getSetting('ai_api_key'));
    if (aiActive) {
      const senderStatsForVip = new SenderStatsRepository(db);
      const vipSenderKey = buildSenderKey(notification.packageName, notification.title ?? '');
      const vipSenderCtx = await senderStatsForVip.get(vipSenderKey);
      const aiResult = await classifyNotification(notification, vipSenderCtx ?? undefined);
      // Only adopt AI refinements when it actually saw a task — an isTask=false
      // result must not rewrite the VIP task's title or attach a due date.
      if (aiResult !== null && aiResult.isTask) {
        if (aiResult.title) title = aiResult.title;
        // Keep VIP urgent unless AI is confident it's genuinely lower priority.
        if (aiResult.certainty === 'high') priority = aiResult.priority;
        dueDate = aiResult.dueDate ?? null;
      }
    }
    const vipTask = await taskRepo.createTask({
      title,
      body: notification.bigText || notification.text,
      sourceApp: notification.packageName,
      sender: notification.title,
      priority,
      confidence: 1.0,
      needsConfirmation: false,
      matchedKeywords: aiActive ? ['vip_contact', 'ai_classifier'] : ['vip_contact'],
      language: 'EN',
      dueDate,
      notificationKey: notification.notificationKey || null,
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
    // Sync to Google Tasks (non-blocking, fire-and-forget)
    if (getSetting('google_tasks_enabled')) {
      const notesLines: string[] = [];
      notesLines.push(`Source: ${appDisplayName(notification.packageName)}`);
      if (vipTask.body) notesLines.push(`\nContext:\n${vipTask.body.slice(0, 500)}`);
      void createGoogleTask({
        title: vipTask.title,
        notes: notesLines.join('\n'),
        dueDate: vipTask.dueDate,
      })
        .then((googleTaskId) => {
          if (googleTaskId) void taskRepo.setGoogleTaskId(vipTask.id, googleTaskId);
        })
        .catch(() => {
          /* non-fatal */
        });
    }
    await refreshPersistentNotification(taskRepo);
    return;
  }

  // ── Cloud AI classifier (primary decision layer when enabled) ───────────────
  // Every non-VIP notification is routed through AI first. AI decides:
  //   isTask=false           → discard
  //   isTask, certainty high → create the task directly
  //   isTask, certainty med/low → create but flag for user confirmation
  if (getSetting('ai_enabled') && getSetting('ai_api_key')) {
    const senderStatsRepo2 = new SenderStatsRepository(db);
    const aiSenderKey = buildSenderKey(notification.packageName, notification.title ?? '');
    const aiSenderCtx = await senderStatsRepo2.get(aiSenderKey);
    const aiResult = await classifyNotification(notification, aiSenderCtx ?? undefined);
    if (aiResult !== null) {
      const taskRepo2 = new TaskRepository(db);
      const messageText2 = notification.bigText || notification.text || notification.title;
      if (aiResult.isTask) {
        const title2 =
          aiResult.title ??
          extractTitle(messageText2, notification.title ?? '', notification.packageName);
        if (await isContentDuplicate(title2, notification.packageName, taskRepo2)) {
          logCapturedNotification(notification, 'FILTERED');
          await refreshPersistentNotification(taskRepo2);
          return;
        }
        const needsConfirmation = aiResult.certainty !== 'high';
        const confidence = aiResult.certainty === 'high' ? 0.95 : 0.6;
        const aiTask = await taskRepo2.createTask({
          title: title2,
          body: notification.bigText || notification.text,
          sourceApp: notification.packageName,
          sender: notification.title,
          priority: aiResult.priority,
          confidence,
          needsConfirmation,
          matchedKeywords: ['ai_classifier', `ai_${aiResult.certainty}`],
          language: 'EN',
          dueDate: aiResult.dueDate ?? null,
          notificationKey: notification.notificationKey || null,
          createdAt: notification.postTime || Date.now(),
          howTo: aiResult.howTo ?? null,
          estimatedMinutes: aiResult.estimatedMinutes ?? null,
        });
        logExtractionDecision({
          input: messageText2,
          language: 'EN',
          ruleScore: 0,
          modelScore: confidence,
          finalScore: confidence,
          matchedKeywords: ['ai_classifier', `ai_${aiResult.certainty}`],
          decision: needsConfirmation ? 'CONFIRM' : 'CREATE',
          timestamp: Date.now(),
        });
        // Sync to Google Tasks (non-blocking, fire-and-forget). Tasks awaiting
        // user confirmation are synced after the user confirms, not before.
        if (!needsConfirmation && getSetting('google_tasks_enabled')) {
          const notesLines: string[] = [];
          if (aiResult.howTo) notesLines.push(`How to complete: ${aiResult.howTo}`);
          if (aiResult.estimatedMinutes)
            notesLines.push(`Estimated time: ${aiResult.estimatedMinutes} min`);
          notesLines.push(`Source: ${appDisplayName(notification.packageName)}`);
          if (aiTask.body) notesLines.push(`\nContext:\n${aiTask.body.slice(0, 500)}`);
          void createGoogleTask({
            title: aiTask.title,
            notes: notesLines.join('\n'),
            dueDate: aiTask.dueDate,
          })
            .then((googleTaskId) => {
              if (googleTaskId) void taskRepo2.setGoogleTaskId(aiTask.id, googleTaskId);
            })
            .catch(() => {
              /* non-fatal */
            });
        }
      } else {
        const discardedRepo2 = new DiscardedLogRepository(db);
        await discardedRepo2.insert({
          notificationId: `${notification.packageName}-${notification.postTime}`,
          notificationKey: notification.notificationKey || null,
          sourceApp: notification.packageName,
          sender: notification.title,
          bodyPreview: (notification.bigText || notification.text).slice(0, 100),
          reason: 'AI_DISCARD',
          confidence: 0.05,
          createdAt: Date.now(),
        });
        logCapturedNotification(notification, 'FILTERED');
      }
      await refreshPersistentNotification(taskRepo2);
      return;
    }
    // AI call failed (no key, timeout, error) → fall through to heuristic safety net
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
      notificationKey: notification.notificationKey || null,
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

  if (await isContentDuplicate(candidateTitle, notification.packageName, taskRepo)) {
    logCapturedNotification(notification, 'FILTERED');
    return;
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

  const heuristicTask = await taskRepo.createTask({
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
    notificationKey: notification.notificationKey || null,
    createdAt: notification.postTime || Date.now(),
  });

  // Sync to Google Tasks (non-blocking, fire-and-forget). Tasks awaiting
  // user confirmation are synced after the user confirms, not before.
  if (!needsConfirmation && getSetting('google_tasks_enabled')) {
    const notesLines: string[] = [];
    notesLines.push(`Source: ${appDisplayName(notification.packageName)}`);
    if (heuristicTask.body) notesLines.push(`\nContext:\n${heuristicTask.body.slice(0, 500)}`);
    void createGoogleTask({
      title: heuristicTask.title,
      notes: notesLines.join('\n'),
      dueDate: heuristicTask.dueDate,
    })
      .then((googleTaskId) => {
        if (googleTaskId) void taskRepo.setGoogleTaskId(heuristicTask.id, googleTaskId);
      })
      .catch(() => {
        /* non-fatal */
      });
  }

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

const PRIORITY_ORDER: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

async function refreshPersistentNotification(taskRepo: TaskRepository): Promise<void> {
  try {
    const pending = await taskRepo.getPendingTasks();
    const urgent = pending.filter((t) => t.priority === 'URGENT');
    const sorted = [...pending].sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 3) - (PRIORITY_ORDER[b.priority] ?? 3)
    );
    await NotificationListener.updatePersistentNotification({
      pendingCount: pending.length,
      urgentCount: urgent.length,
      taskTexts: sorted.slice(0, 5).map((t) => t.title),
    });
  } catch {
    /* ForegroundService may not be running — non-fatal */
  }
}
