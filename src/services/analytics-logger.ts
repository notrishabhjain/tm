import { db, initializeDatabase } from '@/data/db/client';
import { llmMetrics } from '@/data/db/schema';

export async function logLlmLoad(modelId: string, durationMs: number): Promise<void> {
  try {
    initializeDatabase();
    await db
      .insert(llmMetrics)
      .values({ modelId, eventType: 'load', durationMs, createdAt: Date.now() });
  } catch {
    /* non-fatal */
  }
}

export async function logLlmInference(params: {
  modelId: string;
  durationMs: number;
  decision: 'CREATE' | 'CONFIRM' | 'DISCARD';
  confidence: number;
  inputLength: number;
}): Promise<void> {
  try {
    initializeDatabase();
    await db.insert(llmMetrics).values({
      modelId: params.modelId,
      eventType: 'inference',
      durationMs: params.durationMs,
      decision: params.decision,
      confidence: params.confidence,
      inputLength: params.inputLength,
      createdAt: Date.now(),
    });
  } catch {
    /* non-fatal */
  }
}
