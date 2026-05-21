/**
 * Download manager for the Qwen3-1.7B INT4 ONNX model.
 *
 * Model source: onnx-community/Qwen3-1.7B-ONNX (cpu-int4-rtn-block-32-acc-level-4)
 * All files are downloaded into a single local directory that onnxruntime-genai
 * can load directly via Model(modelDir).
 *
 * Estimated download: ~1 GB (model weights + ~6 MB config/tokenizer files).
 */

import * as FileSystem from 'expo-file-system';

const HF_BASE =
  'https://huggingface.co/onnx-community/Qwen3-1.7B-ONNX/resolve/main/cpu-int4-rtn-block-32-acc-level-4/';

const LLM_DIR_NAME = 'taskmind_qwen3_int4/';

interface ModelFile {
  name: string;
  sizeBytesHint: number;
  optional: boolean;
}

/** All files needed by onnxruntime-genai to load the model directory. */
const ALL_MODEL_FILES: ReadonlyArray<ModelFile> = [
  { name: 'genai_config.json', sizeBytesHint: 3_000, optional: false },
  { name: 'tokenizer.json', sizeBytesHint: 3_200_000, optional: false },
  { name: 'tokenizer_config.json', sizeBytesHint: 2_000, optional: false },
  { name: 'special_tokens_map.json', sizeBytesHint: 1_000, optional: false },
  // model.onnx is the structure file; model.onnx.data contains the weight tensors
  // (external-data format). If .data doesn't exist, all weights are inside model.onnx.
  { name: 'model.onnx', sizeBytesHint: 15_000_000, optional: false },
  { name: 'model.onnx.data', sizeBytesHint: 950_000_000, optional: true },
];

const TOTAL_EXPECTED_BYTES = ALL_MODEL_FILES.reduce((s, f) => s + f.sizeBytesHint, 0);

export function getLlmModelDir(): string {
  return `${FileSystem.documentDirectory ?? ''}${LLM_DIR_NAME}`;
}

export async function isLlmCached(): Promise<boolean> {
  const dir = getLlmModelDir();
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) return false;

  // Verify all required (non-optional) files exist
  for (const f of ALL_MODEL_FILES.filter((x) => !x.optional)) {
    const info = await FileSystem.getInfoAsync(`${dir}${f.name}`);
    if (!info.exists) return false;
  }
  return true;
}

export async function getLlmSizeBytes(): Promise<number> {
  const dir = getLlmModelDir();
  let total = 0;
  for (const f of ALL_MODEL_FILES) {
    try {
      const info = await FileSystem.getInfoAsync(`${dir}${f.name}`);
      if (info.exists && 'size' in info && typeof info.size === 'number') total += info.size;
    } catch {
      /* non-fatal */
    }
  }
  return total;
}

export async function downloadLlm(onProgress?: (fraction: number) => void): Promise<void> {
  const dir = getLlmModelDir();

  // Ensure directory exists
  const dirInfo = await FileSystem.getInfoAsync(dir);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  }

  let downloadedBytes = 0;

  const reportProgress = (): void => {
    if (onProgress) {
      onProgress(Math.min(downloadedBytes / TOTAL_EXPECTED_BYTES, 0.99));
    }
  };

  for (const file of ALL_MODEL_FILES) {
    const localPath = `${dir}${file.name}`;

    // Skip if already present and non-empty
    const existing = await FileSystem.getInfoAsync(localPath);
    if (existing.exists && 'size' in existing && typeof existing.size === 'number' && existing.size > 0) {
      downloadedBytes += existing.size;
      reportProgress();
      continue;
    }

    const url = `${HF_BASE}${file.name}`;
    try {
      const downloadResumable = FileSystem.createDownloadResumable(
        url,
        localPath,
        {},
        ({ totalBytesWritten }: FileSystem.DownloadProgressData) => {
          downloadedBytes += totalBytesWritten;
          reportProgress();
        }
      );
      const result = await downloadResumable.downloadAsync();
      if (!result?.uri) {
        if (!file.optional) throw new Error(`Failed to download required file: ${file.name}`);
        // Optional file not found — remove any partial download
        await FileSystem.deleteAsync(localPath, { idempotent: true });
      }
    } catch (err) {
      if (!file.optional) throw err;
      await FileSystem.deleteAsync(localPath, { idempotent: true });
    }
  }

  onProgress?.(1);
}

export async function deleteLlm(): Promise<void> {
  const dir = getLlmModelDir();
  const info = await FileSystem.getInfoAsync(dir);
  if (info.exists) await FileSystem.deleteAsync(dir, { idempotent: true });
}
