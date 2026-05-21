import { requireNativeModule } from 'expo-modules-core';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let NativeLlm: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NativeLlm = requireNativeModule<any>('LlmInference');
} catch {
  // Native module unavailable in non-Android environments (e.g. Jest, iOS stub)
}

const LlmModule = {
  isModelLoaded(): boolean {
    if (!NativeLlm) return false;
    return NativeLlm.isModelLoaded() as boolean;
  },

  loadModel(modelDir: string): Promise<void> {
    if (!NativeLlm) return Promise.resolve();
    return NativeLlm.loadModel(modelDir) as Promise<void>;
  },

  /** Generate a response. Returns the assistant reply only (input prompt stripped). */
  generate(systemPrompt: string, userPrompt: string, maxNewTokens: number = 512): Promise<string> {
    if (!NativeLlm) return Promise.resolve('');
    return NativeLlm.generate(systemPrompt, userPrompt, maxNewTokens) as Promise<string>;
  },

  unloadModel(): void {
    if (!NativeLlm) return;
    NativeLlm.unloadModel();
  },
};

export default LlmModule;
