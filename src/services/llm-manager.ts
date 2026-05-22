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
  if (!result?.uri) {
    throw new Error('Download failed — no response from server');
  }
  // HuggingFace can return 302→CDN or 401/403/429 error pages that still
  // resolve to a URI. Reject anything that isn't a 200.
  if (result.status !== 200) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => undefined);
    throw new Error(`Download failed — server returned HTTP ${String(result.status)}`);
  }
  // Sanity-check the file is at least as large as the minimum expected size.
  // A valid GGUF should be > 1 GB; reject anything suspiciously small.
  const info = await FileSystem.getInfoAsync(localPath);
  const downloadedBytes =
    info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (downloadedBytes < MIN_SIZE_BYTES) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => undefined);
    throw new Error(
      `Download incomplete — received ${String(Math.round(downloadedBytes / 1_000_000))} MB, expected ≥${String(Math.round(MIN_SIZE_BYTES / 1_000_000))} MB. Check your connection and try again.`
    );
  }
  onProgress?.(1);
}

export async function deleteLlm(): Promise<void> {
  const path = getLlmModelPath();
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
}
