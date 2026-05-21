/**
 * Download manager for the Qwen3-1.7B Q4_K_M GGUF model.
 *
 * Model source: bartowski/Qwen3-1.7B-GGUF on HuggingFace.
 * Single ~1.1 GB file stored in documentDirectory.
 * Loaded by llama.rn (llama.cpp) entirely on-device — no network calls at inference time.
 */

import * as FileSystem from 'expo-file-system';

const GGUF_URL =
  'https://huggingface.co/bartowski/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf';
const GGUF_FILENAME = 'taskmind_qwen3_1.7b_q4km.gguf';
const MIN_SIZE_BYTES = 100_000_000; // 100 MB lower-bound sanity check

export function getLlmModelPath(): string {
  return `${FileSystem.documentDirectory ?? ''}${GGUF_FILENAME}`;
}

export async function isLlmCached(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(getLlmModelPath());
    if (!info.exists) return false;
    if ('size' in info && typeof info.size === 'number') return info.size >= MIN_SIZE_BYTES;
    return info.exists;
  } catch {
    return false;
  }
}

export async function getLlmSizeBytes(): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(getLlmModelPath());
    if (info.exists && 'size' in info && typeof info.size === 'number') return info.size;
  } catch {
    /* non-fatal */
  }
  return 0;
}

export async function downloadLlm(onProgress?: (fraction: number) => void): Promise<void> {
  const localPath = getLlmModelPath();

  const downloadResumable = FileSystem.createDownloadResumable(
    GGUF_URL,
    localPath,
    {},
    ({ totalBytesWritten, totalBytesExpectedToWrite }: FileSystem.DownloadProgressData) => {
      if (totalBytesExpectedToWrite > 0) {
        onProgress?.(totalBytesWritten / totalBytesExpectedToWrite);
      }
    }
  );

  const result = await downloadResumable.downloadAsync();
  if (!result?.uri) throw new Error('Model download failed — no URI returned');
  onProgress?.(1);
}

export async function deleteLlm(): Promise<void> {
  const path = getLlmModelPath();
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
}
