import type { ExtractionDecision } from '../types';

export interface AggregatorInput {
  ruleScore: number;
  modelScore: number | null;
  ruleWeight: number;
  modelWeight: number;
  isVipSender: boolean;
}

export interface AggregatorResult {
  finalConfidence: number;
  decision: ExtractionDecision;
}

export function aggregateConfidence(input: AggregatorInput): AggregatorResult {
  let finalConfidence: number;

  if (input.modelScore !== null) {
    const totalWeight = input.ruleWeight + input.modelWeight;
    finalConfidence =
      (input.ruleScore * input.ruleWeight + input.modelScore * input.modelWeight) / totalWeight;
  } else {
    finalConfidence = input.ruleScore;
  }

  finalConfidence = Math.max(0, Math.min(1, finalConfidence));

  // VIP override: accept with lower threshold
  if (input.isVipSender && finalConfidence >= 0.3) {
    return { finalConfidence, decision: 'CREATE' };
  }

  let decision: ExtractionDecision;
  if (finalConfidence >= 0.6) {
    decision = 'CREATE';
  } else if (finalConfidence >= 0.35) {
    decision = 'CONFIRM';
  } else {
    decision = 'DISCARD';
  }

  return { finalConfidence, decision };
}
