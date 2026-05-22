import type { NotificationData } from '../../modules/notification-listener/src/types';
import NotificationListener from '../../modules/notification-listener/src';
import { runExtractionPipeline } from '@/domain/extraction';
import type { PipelineConfig } from '@/domain/extraction';
import type { Keyword } from '@/domain/extraction/ruleEngine';
import { db, initializeDatabase } from '@/data/db/client';
import { tasks, discardedLog as discardedLogTable } from '@/data/db/schema';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { SenderStatsRepository } from '@/data/repositories/SenderStatsRepository';
import { logCapturedNotification, logExtractionDecision } from './diagnostics-logger';
import { LearnedKeywordRepository } from '@/data/repositories/LearnedKeywordRepository';
import { extractNgrams, languageForText } from './ngram-extractor';
import { isModelLoaded, classifyTaskProbability } from './onnx-classifier';
import { isSmallLlmLoaded, classifyNotification, type FewShotExample } from './llm-service';
import { desc, and, isNull, gt, eq } from 'drizzle-orm';
import seedKeywordsRaw from '../../assets/seed-keywords.json';

type RawKeyword = { keyword: string; language: string; priority_hint: string };

function priorityHintToCategory(hint: string): Keyword['category'] {
  if (hint === 'URGENT') return 'URGENCY';
  if (hint === 'HIGH') return 'IMPERATIVE';
  if (hint === 'MEDIUM') return 'IMPERATIVE';
  return 'ANTI_PATTERN';
}

const SEED_VOCABULARY: Keyword[] = (seedKeywordsRaw as RawKeyword[]).map((k) => ({
  phrase: k.keyword,
  category: priorityHintToCategory(k.priority_hint),
  language: k.language as Keyword['language'],
  weight: k.priority_hint === 'URGENT' ? 1.5 : k.priority_hint === 'HIGH' ? 1.2 : 1.0,
}));

// Pull up to 6 recent confirm/reject examples for few-shot context.
// Positive = recent non-deleted tasks. Negative = user-rejected from discarded_log.
async function getFewShotExamples(): Promise<FewShotExample[]> {
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  try {
    const [positives, negatives] = await Promise.all([
      db
        .select({
          body: tasks.body,
          title: tasks.title,
          sourceApp: tasks.sourceApp,
          sender: tasks.sender,
        })
        .from(tasks)
        .where(and(isNull(tasks.deletedAt), gt(tasks.createdAt, sevenDaysAgo)))
        .orderBy(desc(tasks.createdAt))
        .limit(4),
      db
        .select({
          bodyPreview: discardedLogTable.bodyPreview,
          sourceApp: discardedLogTable.sourceApp,
          sender: discardedLogTable.sender,
        })
        .from(discardedLogTable)
        .where(
          and(
            eq(discardedLogTable.reason, 'USER_REJECTED'),
            gt(discardedLogTable.createdAt, sevenDaysAgo)
          )
        )
        .orderBy(desc(discardedLogTable.createdAt))
        .limit(4),
    ]);

    const pos: FewShotExample[] = (
      positives as Array<{
        body: string | null;
        title: string;
        sourceApp: string;
        sender: string | null;
      }>
    ).map((t) => ({
      appName: t.sourceApp.split('.').pop() ?? t.sourceApp,
      sender: t.sender ?? null,
      text: ((t.body ?? t.title) || '').slice(0, 100),
      decision: 'confirmed' as const,
      title: t.title,
    }));
    const neg: FewShotExample[] = (
      negatives as Array<{ bodyPreview: string; sourceApp: string; sender: string | null }>
    ).map((d) => ({
      appName: d.sourceApp.split('.').pop() ?? d.sourceApp,
      sender: d.sender ?? null,
      text: d.bodyPreview.slice(0, 100),
      decision: 'rejected' as const,
      title: null,
    }));

    // Interleave for diversity, max 6 total
    const combined: FewShotExample[] = [];
    for (let i = 0; i < 3; i++) {
      if (pos[i]) combined.push(pos[i]);
      if (neg[i]) combined.push(neg[i]);
    }
    return combined;
  } catch {
    return [];
  }
}

export async function handleNotification(taskData: {
  notification: NotificationData;
}): Promise<void> {
  const { notification } = taskData;

  initializeDatabase();

  const monitoredRepo = new MonitoredAppRepository(db);
  const activePackages = await monitoredRepo.getActivePackageNames();

  if (activePackages.length > 0 && !activePackages.includes(notification.packageName)) {
    logCapturedNotification(notification, 'FILTERED');
    return;
  }

  logCapturedNotification(notification, 'PASSED');

  const vipRepo = new VipContactRepository(db);
  const allVipIds = await vipRepo.getAllIdentifiers();

  // VIP contacts bypass all classification — always URGENT, no confirmation
  const senderText = `${notification.title ?? ''} ${notification.text ?? ''}`;
  const isVip =
    allVipIds.length > 0 &&
    allVipIds.some((vip) => senderText.toLowerCase().includes(vip.toLowerCase()));

  if (isVip) {
    const vipTaskRepo = new TaskRepository(db);
    const messageText = notification.bigText || notification.text || notification.title;
    await vipTaskRepo.createTask({
      title: notification.title
        ? `${notification.title}: ${(notification.text || '').slice(0, 80)}`
        : messageText.slice(0, 120),
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
    return;
  }

  const pipelineText = notification.bigText || notification.text;
  const senderKey = `${notification.packageName}:${notification.title}`;
  const senderStatsRepo = new SenderStatsRepository(db);
  const taskRepo = new TaskRepository(db);

  // ── Primary: LLM classification (Qwen3-0.6B) when loaded ────────────────────
  if (isSmallLlmLoaded()) {
    const examples = await getFewShotExamples();
    const appName = notification.packageName.split('.').pop() ?? notification.packageName;

    const llmResult = await classifyNotification({
      text: pipelineText,
      appName,
      sender: notification.title ?? null,
      examples,
    });

    if (llmResult !== null) {
      const decision: 'CREATE' | 'CONFIRM' | 'DISCARD' = !llmResult.actionable
        ? 'DISCARD'
        : llmResult.confidence >= 0.75
          ? 'CREATE'
          : llmResult.confidence >= 0.35
            ? 'CONFIRM'
            : 'DISCARD';

      logExtractionDecision({
        input: pipelineText,
        language: 'EN',
        ruleScore: 0,
        modelScore: llmResult.confidence,
        finalScore: llmResult.confidence,
        matchedKeywords: ['llm_classification'],
        decision,
        timestamp: Date.now(),
      });

      if (decision === 'DISCARD') {
        const discardedRepo = new DiscardedLogRepository(db);
        await discardedRepo.insert({
          notificationId: `${notification.packageName}-${notification.postTime}`,
          sourceApp: notification.packageName,
          sender: notification.title,
          bodyPreview: pipelineText.slice(0, 100),
          reason: 'LOW_CONFIDENCE',
          confidence: llmResult.confidence,
          createdAt: Date.now(),
        });
        await refreshPersistentNotification(taskRepo);
        return;
      }

      await taskRepo.createTask({
        title: llmResult.title || pipelineText.slice(0, 120),
        body: notification.bigText || notification.text,
        sourceApp: notification.packageName,
        sender: notification.title,
        priority: llmResult.priority,
        confidence: llmResult.confidence,
        needsConfirmation: decision === 'CONFIRM',
        matchedKeywords: ['llm_classification'],
        language: 'EN',
      });

      if (decision === 'CREATE') {
        await senderStatsRepo.incrementAutoAccept(senderKey);
        const learnedRepo = new LearnedKeywordRepository(db);
        const ngrams = extractNgrams(pipelineText, 'EN');
        if (ngrams.length > 0) {
          try {
            await learnedRepo.recordNgrams(ngrams, languageForText('EN'));
          } catch {
            /* non-fatal */
          }
        }
      }

      await refreshPersistentNotification(taskRepo);
      return;
    }
    // LLM inference error → fall through to rule engine
  }

  // ── Fallback: rule engine + MiniLM ───────────────────────────────────────────
  const confidenceAdjustment = await senderStatsRepo.getConfidenceAdjustment(senderKey);
  const learnedRepo = new LearnedKeywordRepository(db);
  const activeLearnedKws = await learnedRepo.getActive();
  const learnedVocab: Keyword[] = activeLearnedKws.map((kw) => ({
    phrase: kw.ngram,
    category: 'IMPERATIVE' as Keyword['category'],
    language: kw.language as Keyword['language'],
    weight: kw.weight,
  }));

  const modelAvailable = isModelLoaded();
  const modelWeight = modelAvailable ? 0.35 : 0.0;

  const config: PipelineConfig = {
    vocabulary: [...SEED_VOCABULARY, ...learnedVocab],
    vipSenders: allVipIds,
    ruleWeight: (1.0 + confidenceAdjustment) * (1.0 - modelWeight),
    modelWeight,
    modelInferer: modelAvailable ? (text) => classifyTaskProbability(text) : undefined,
  };

  const pipelineInput = {
    text: pipelineText,
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
    await refreshPersistentNotification(taskRepo);
    return;
  }

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
    dueDate: result.dueDate ?? null,
  });

  if (result.decision === 'CREATE') {
    await senderStatsRepo.incrementAutoAccept(senderKey);
    const ngrams = extractNgrams(pipelineInput.text, result.language);
    if (ngrams.length > 0) {
      try {
        await learnedRepo.recordNgrams(ngrams, languageForText(result.language));
      } catch {
        /* non-fatal */
      }
    }
  }

  await refreshPersistentNotification(taskRepo);
  void task;
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
