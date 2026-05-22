import * as FileSystem from 'expo-file-system';

// ── Qwen3-1.7B (large extractor) ─────────────────────────────────────────────

const LARGE_GGUF_URL =
  'https://huggingface.co/bartowski/Qwen3-1.7B-GGUF/resolve/main/Qwen3-1.7B-Q4_K_M.gguf';
const LARGE_GGUF_FILENAME = 'taskmind_qwen3_1.7b_q4km.gguf';
const LARGE_MIN_SIZE_BYTES = 100_000_000;

// Display constants exported for the UI to show download instructions
export const LARGE_GGUF_DISPLAY_REPO = 'bartowski/Qwen3-1.7B-GGUF';
export const LARGE_GGUF_DISPLAY_FILENAME = 'Qwen3-1.7B-Q4_K_M.gguf';
export { LARGE_GGUF_URL as LARGE_GGUF_DOWNLOAD_URL };

export function getLlmModelPath(): string {
  return `${FileSystem.documentDirectory ?? ''}${LARGE_GGUF_FILENAME}`;
}

export async function isLlmCached(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(getLlmModelPath());
    if (!info.exists) return false;
    if ('size' in info && typeof info.size === 'number') return info.size >= LARGE_MIN_SIZE_BYTES;
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
    LARGE_GGUF_URL,
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
  if (result.status !== 200) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => undefined);
    throw new Error(`Download failed — server returned HTTP ${String(result.status)}`);
  }
  const info = await FileSystem.getInfoAsync(localPath);
  const downloadedBytes =
    info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (downloadedBytes < LARGE_MIN_SIZE_BYTES) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => undefined);
    throw new Error(
      `Download incomplete — received ${String(Math.round(downloadedBytes / 1_000_000))} MB, expected ≥${String(Math.round(LARGE_MIN_SIZE_BYTES / 1_000_000))} MB. Check your connection and try again.`
    );
  }
  onProgress?.(1);
}

export async function deleteLlm(): Promise<void> {
  const path = getLlmModelPath();
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
}

export async function importLlmFromUri(sourceUri: string, fileSizeHint?: number): Promise<void> {
  const destPath = getLlmModelPath();
  await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  const info = await FileSystem.getInfoAsync(destPath);
  const size =
    info.exists && 'size' in info && typeof info.size === 'number'
      ? info.size
      : (fileSizeHint ?? 0);
  if (size < LARGE_MIN_SIZE_BYTES) {
    await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => undefined);
    throw new Error(
      `File too small (${String(Math.round(size / 1_000_000))} MB) — expected a ~1.1 GB GGUF. Make sure you selected "${LARGE_GGUF_DISPLAY_FILENAME}".`
    );
  }
}

// ── Qwen3-0.6B (small classifier) ────────────────────────────────────────────

const SMALL_GGUF_URL =
  'https://huggingface.co/bartowski/Qwen3-0.6B-GGUF/resolve/main/Qwen3-0.6B-Q4_K_M.gguf';
const SMALL_GGUF_FILENAME = 'taskmind_qwen3_0.6b_q4km.gguf';
const SMALL_MIN_SIZE_BYTES = 50_000_000;

export const SMALL_GGUF_DISPLAY_REPO = 'bartowski/Qwen3-0.6B-GGUF';
export const SMALL_GGUF_DISPLAY_FILENAME = 'Qwen3-0.6B-Q4_K_M.gguf';
export { SMALL_GGUF_URL as SMALL_GGUF_DOWNLOAD_URL };

export function getSmallLlmModelPath(): string {
  return `${FileSystem.documentDirectory ?? ''}${SMALL_GGUF_FILENAME}`;
}

export async function isSmallLlmCached(): Promise<boolean> {
  try {
    const info = await FileSystem.getInfoAsync(getSmallLlmModelPath());
    if (!info.exists) return false;
    if ('size' in info && typeof info.size === 'number') return info.size >= SMALL_MIN_SIZE_BYTES;
    return info.exists;
  } catch {
    return false;
  }
}

export async function getSmallLlmSizeBytes(): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(getSmallLlmModelPath());
    if (info.exists && 'size' in info && typeof info.size === 'number') return info.size;
  } catch {
    /* non-fatal */
  }
  return 0;
}

export async function downloadSmallLlm(onProgress?: (fraction: number) => void): Promise<void> {
  const localPath = getSmallLlmModelPath();

  const downloadResumable = FileSystem.createDownloadResumable(
    SMALL_GGUF_URL,
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
  if (result.status !== 200) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => undefined);
    throw new Error(`Download failed — server returned HTTP ${String(result.status)}`);
  }
  const info = await FileSystem.getInfoAsync(localPath);
  const downloadedBytes =
    info.exists && 'size' in info && typeof info.size === 'number' ? info.size : 0;
  if (downloadedBytes < SMALL_MIN_SIZE_BYTES) {
    await FileSystem.deleteAsync(localPath, { idempotent: true }).catch(() => undefined);
    throw new Error(
      `Download incomplete — received ${String(Math.round(downloadedBytes / 1_000_000))} MB, expected ≥${String(Math.round(SMALL_MIN_SIZE_BYTES / 1_000_000))} MB. Check your connection and try again.`
    );
  }
  onProgress?.(1);
}

export async function deleteSmallLlm(): Promise<void> {
  const path = getSmallLlmModelPath();
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true });
}

export async function importSmallLlmFromUri(
  sourceUri: string,
  fileSizeHint?: number
): Promise<void> {
  const destPath = getSmallLlmModelPath();
  await FileSystem.copyAsync({ from: sourceUri, to: destPath });
  const info = await FileSystem.getInfoAsync(destPath);
  const size =
    info.exists && 'size' in info && typeof info.size === 'number'
      ? info.size
      : (fileSizeHint ?? 0);
  if (size < SMALL_MIN_SIZE_BYTES) {
    await FileSystem.deleteAsync(destPath, { idempotent: true }).catch(() => undefined);
    throw new Error(
      `File too small (${String(Math.round(size / 1_000_000))} MB) — expected a ~380 MB GGUF. Make sure you selected "${SMALL_GGUF_DISPLAY_FILENAME}".`
    );
  }
}
