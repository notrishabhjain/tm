import type { ExtractionResult, Language } from '../types';
import type { Keyword } from './ruleEngine';
import { detectLanguage } from './languageDetector';
import { preprocessText, isNoise } from './preprocessor';
import { runRuleEngine } from './ruleEngine';
import { assignPriority } from './priorityAssigner';
import { extractTaskText } from './actionExtractor';
import { aggregateConfidence } from './confidenceAggregator';

export interface PipelineInput {
  text: string;
  title?: string;
  sourceApp?: string;
}

export interface PipelineConfig {
  vocabulary: Keyword[];
  vipSenders: string[];
  ruleWeight: number;
  modelWeight: number;
  modelInferer?: (text: string, language: Language) => Promise<number>;
}

export async function runExtractionPipeline(
  input: PipelineInput,
  config: PipelineConfig
): Promise<ExtractionResult> {
  const combinedText = [input.title, input.text].filter(Boolean).join(' ');

  // Early exit for noise
  if (isNoise(combinedText)) {
    return {
      decision: 'DISCARD',
      priority: 'LOW',
      confidence: 0,
      language: 'EN',
      ruleScore: 0,
      modelScore: null,
      matchedKeywords: [],
      extractedTitle: combinedText.slice(0, 50),
      discardReason: 'TOO_SHORT',
    };
  }

  const language = detectLanguage(combinedText);
  const { normalized, wordCount } = preprocessText(combinedText);

  const relevantVocab = config.vocabulary.filter(
    (v) => v.language === language || v.language === 'EN' || language === 'HI-EN'
  );

  const ruleResult = runRuleEngine(normalized, wordCount, relevantVocab);

  const senderLower = (input.title ?? '').toLowerCase();
  const isVipSender = config.vipSenders.some((vip) => senderLower.includes(vip.toLowerCase()));

  let modelScore: number | null = null;
  if (config.modelInferer) {
    try {
      modelScore = await Promise.race([
        config.modelInferer(normalized, language),
        new Promise<number>((_, reject) => setTimeout(() => reject(new Error('timeout')), 500)),
      ]);
    } catch {
      modelScore = null;
    }
  }

  const { finalConfidence, decision } = aggregateConfidence({
    ruleScore: ruleResult.score,
    modelScore,
    ruleWeight: config.ruleWeight,
    modelWeight: config.modelWeight,
    isVipSender,
  });

  const priority = assignPriority(
    {
      hasImperative: ruleResult.hasImperative,
      hasUrgency: ruleResult.hasUrgency,
      hasDeadline: ruleResult.hasDeadline,
      urgencyWeight: ruleResult.urgencyWeight,
    },
    isVipSender
  );

  const extractedTitle = extractTaskText(combinedText);

  const discardReason =
    decision === 'DISCARD'
      ? ruleResult.hasAntiPattern
        ? 'ANTI_PATTERN'
        : wordCount < 3
          ? 'TOO_SHORT'
          : 'LOW_CONFIDENCE'
      : undefined;

  return {
    decision,
    priority,
    confidence: finalConfidence,
    language,
    ruleScore: ruleResult.score,
    modelScore,
    matchedKeywords: ruleResult.matches.map((m) => m.phrase),
    extractedTitle,
    discardReason,
  };
}
