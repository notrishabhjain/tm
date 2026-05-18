/**
 * Orchestrates the full extraction pipeline.
 * All stages are pure functions — no side effects, no RN imports.
 *
 * @module domain/extraction/pipeline
 */
import type { KeywordEntry } from './ruleEngine';
import type { ExtractionResult, ModelInferenceResult, NotificationInput } from './types';
import { extractAction } from './actionExtractor';
import { aggregateConfidence } from './confidenceAggregator';
import { detectLanguage } from './languageDetector';
import { combineNotificationFields, preprocess } from './preprocessor';
import { assignPriority } from './priorityAssigner';
import { runRuleEngine } from './ruleEngine';
import { KeywordCategory } from './types';

export interface PipelineConfig {
  keywords: KeywordEntry[];
  ruleWeight?: number;
  modelWeight?: number;
  isVip?: boolean;
  /** Higher threshold for transcript imports */
  overrideAutoCreateThreshold?: number;
}

/**
 * Run the full extraction pipeline on a notification.
 *
 * @pure — no side effects. Call from Headless JS task.
 */
export function runExtractionPipeline(
  input: NotificationInput,
  modelResult: ModelInferenceResult | null,
  config: PipelineConfig,
): ExtractionResult {
  // Stage 1: Language detection
  const combined = combineNotificationFields(input.title, input.text, input.bigText);
  const { language } = detectLanguage(combined);

  // Stage 2: Preprocessing
  const { normalized, original, wordCount } = preprocess(combined);

  // Stage 3: Rule engine
  const ruleResult = runRuleEngine(normalized, wordCount, config.keywords);

  // Stage 4: (ML inference is done by caller, passed in as modelResult)

  // Stage 5: Priority assignment
  const priority = assignPriority(ruleResult);

  // Stage 6: Action extraction
  const imperativeKeywords = config.keywords
    .filter((k) => k.category === KeywordCategory.IMPERATIVE)
    .map((k) => k.phrase);
  const extractedText = extractAction(normalized, original, imperativeKeywords);

  // Stage 7: Confidence aggregation + decision
  const { finalConfidence, modelScore, decision } = aggregateConfidence(
    ruleResult.score,
    modelResult,
    config.ruleWeight,
    config.modelWeight,
    config.isVip,
  );

  // Determine discard reason if applicable
  let discardReason: ExtractionResult['discardReason'] = null;
  if (decision === 'DISCARD') {
    if (wordCount < 3) discardReason = 'TOO_SHORT';
    else if (ruleResult.hasAntiPattern && !ruleResult.hasImperative) discardReason = 'ANTI_PATTERN';
    else discardReason = 'LOW_CONFIDENCE';
  }

  return {
    decision,
    extractedText,
    priority,
    confidence: finalConfidence,
    ruleScore: ruleResult.score,
    modelScore,
    language,
    matchedKeywords: ruleResult.matchedKeywords,
    discardReason,
  };
}
