import type { NotificationData } from '../../modules/notification-listener/src/types';
import NotificationListener from '../../modules/notification-listener/src';
import { runExtractionPipeline } from '@/domain/extraction';
import type { PipelineConfig } from '@/domain/extraction';
import type { Keyword } from '@/domain/extraction/ruleEngine';
import { db, initializeDatabase } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { SenderStatsRepository } from '@/data/repositories/SenderStatsRepository';
import { logCapturedNotification, logExtractionDecision } from './diagnostics-logger';
import seedKeywordsRaw from '../../assets/seed-keywords.json';

type RawKeyword = { keyword: string; language: string; priority_hint: string };

function priorityHintToCategory(hint: string): Keyword['category'] {
  if (hint === 'URGENT') return 'URGENCY';
  if (hint === 'HIGH') return 'DEADLINE';
  if (hint === 'MEDIUM') return 'IMPERATIVE';
  return 'ANTI_PATTERN';
}

const SEED_VOCABULARY: Keyword[] = (seedKeywordsRaw as RawKeyword[]).map((k) => ({
  phrase: k.keyword,
  category: priorityHintToCategory(k.priority_hint),
  language: k.language as Keyword['language'],
  weight: k.priority_hint === 'URGENT' ? 1.5 : k.priority_hint === 'HIGH' ? 1.2 : 1.0,
}));

export async function handleNotification(taskData: {
  notification: NotificationData;
}): Promise<void> {
  const { notification } = taskData;

  await initializeDatabase();

  const monitoredRepo = new MonitoredAppRepository(db);
  const activePackages = await monitoredRepo.getActivePackageNames();

  if (activePackages.length > 0 && !activePackages.includes(notification.packageName)) {
    logCapturedNotification(notification, 'FILTERED');
    return;
  }

  logCapturedNotification(notification, 'PASSED');

  const vipRepo = new VipContactRepository(db);
  const allVipIds = await vipRepo.getAllIdentifiers();

  const senderKey = `${notification.packageName}:${notification.title}`;
  const senderStatsRepo = new SenderStatsRepository(db);
  const confidenceAdjustment = await senderStatsRepo.getConfidenceAdjustment(senderKey);

  const config: PipelineConfig = {
    vocabulary: SEED_VOCABULARY,
    vipSenders: allVipIds,
    ruleWeight: 1.0 + confidenceAdjustment,
    modelWeight: 0.0,
  };

  const pipelineInput = {
    text: notification.bigText || notification.text,
    title: notification.title,
    sourceApp: notification.packageName,
  };

  const result = await runExtractionPipeline(pipelineInput, config);

  logExtractionDecision({
    input: pipelineInput.text,
    language: result.language,
    ruleScore: result.ruleScore,
    modelScore: result.modelScore,
    finalScore: result.confidence,
    matchedKeywords: result.matchedKeywords,
    decision: result.decision,
    timestamp: Date.now(),
  });

  if (result.decision === 'DISCARD') {
    const discardedRepo = new DiscardedLogRepository(db);
    await discardedRepo.insert({
      notificationId: `${notification.packageName}-${notification.postTime}`,
      sourceApp: notification.packageName,
      sender: notification.title,
      bodyPreview: pipelineInput.text.slice(0, 100),
      reason: result.discardReason ?? 'LOW_CONFIDENCE',
      confidence: result.confidence,
      createdAt: Date.now(),
    });
    return;
  }

  const taskRepo = new TaskRepository(db);
  const task = await taskRepo.createTask({
    title: result.extractedTitle || pipelineInput.text.slice(0, 120),
    body: notification.bigText || notification.text,
    sourceApp: notification.packageName,
    sender: notification.title,
    priority: result.priority,
    confidence: result.confidence,
    needsConfirmation: result.decision === 'CONFIRM',
    matchedKeywords: result.matchedKeywords,
    language: result.language,
  });

  if (result.decision === 'CREATE') {
    await senderStatsRepo.incrementAutoAccept(senderKey);
  }

  try {
    const taskRepo2 = new TaskRepository(db);
    const pending = await taskRepo2.getPendingTasks();
    const urgent = pending.filter((t) => t.priority === 'URGENT');
    await NotificationListener.updatePersistentNotification({
      pendingCount: pending.length,
      urgentCount: urgent.length,
      topTaskText: pending[0]?.title ?? '',
      secondTaskText: pending[1]?.title ?? null,
    });
  } catch {
    // ForegroundService may not be running; non-fatal
  }

  void task;
}
