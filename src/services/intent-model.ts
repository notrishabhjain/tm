import type { ModelData } from './model-manager';
import { featurize } from './text-featurizer';

function sigmoid(x: number): number {
  // Clamp to avoid float overflow
  return 1 / (1 + Math.exp(-Math.max(-60, Math.min(60, x))));
}

// Logistic regression forward pass.
// Returns probability that the text is an actionable task (0–1).
export function runInference(text: string, model: ModelData): number {
  if (!model.weights || model.weights.length === 0) return 0.5;
  const features = featurize(text);
  let logit = model.bias;
  const len = Math.min(features.length, model.weights.length);
  for (let i = 0; i < len; i++) {
    logit += features[i] * model.weights[i];
  }
  return sigmoid(logit);
}
