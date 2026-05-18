import type { ExtractionDecision, ModelInferenceResult } from './types';
import { CONFIDENCE_THRESHOLDS } from './types';

/**
 * Stage 7: Combine rule score and optional model score into final decision.
 *
 * Per SRS FR-EX-08 & FR-EX-09.
 */
export function aggregateConfidence(
  ruleScore: number,
  modelResult: ModelInferenceResult | null,
  ruleWeight = 0.5,
  modelWeight = 0.5,
  isVip = false,
): {
  finalConfidence: number;
  modelScore: number | null;
  decision: ExtractionDecision;
} {
  let finalConfidence: number;
  let modelScore: number | null = null;

  if (modelResult) {
    modelScore =
      modelResult.label === 'TASK' ? modelResult.confidence : 1 - modelResult.confidence;
    finalConfidence = ruleScore * ruleWeight + modelScore * modelWeight;
  } else {
    // Rule-only mode: treat rule as full weight
    finalConfidence = ruleScore;
  }

  finalConfidence = Math.max(0, Math.min(1, finalConfidence));

  let decision: ExtractionDecision;

  if (isVip && finalConfidence >= CONFIDENCE_THRESHOLDS.VIP_OVERRIDE) {
    decision = 'CREATE';
  } else if (finalConfidence >= CONFIDENCE_THRESHOLDS.AUTO_CREATE) {
    decision = 'CREATE';
  } else if (finalConfidence >= CONFIDENCE_THRESHOLDS.NEEDS_CONFIRMATION) {
    decision = 'CONFIRM';
  } else {
    decision = 'DISCARD';
  }

  return { finalConfidence, modelScore, decision };
}
