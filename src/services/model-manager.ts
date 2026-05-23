import * as FileSystem from 'expo-file-system';
import { getSetting, setSetting } from '@/data/storage/settings';

export interface ModelData {
  version: string;
  type: 'logistic_regression';
  featureDim: number;
  weights: number[];
  bias: number;
}

export interface ModelInfo {
  version: string;
  source: 'downloaded' | 'none';
  weightCount: number;
}

export interface DownloadOptions {
  url?: string;
  onProgress?: (fraction: number) => void;
}

const MODEL_FILENAME = 'intent-classifier.json';

// Release URL for the bundled model — update when a new version ships.
export const DEFAULT_MODEL_URL =
  'https://github.com/notrishabhjain/tm/releases/download/models/intent-classifier-v1.json';

export function getModelPath(): string {
  return `${FileSystem.documentDirectory ?? ''}${MODEL_FILENAME}`;
}

// Zero-weight model — identical to rule-only scoring (no effect).
const NEUTRAL_MODEL: ModelData = {
  version: '0.0.0',
  type: 'logistic_regression',
  featureDim: 8192,
  weights: [],
  bias: 0,
};

let _cached: ModelData | null = null;

export async function loadModel(): Promise<ModelData> {
  if (_cached) return _cached;
  const path = getModelPath();
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const json = await FileSystem.readAsStringAsync(path);
      const parsed = JSON.parse(json) as ModelData;
      if (Array.isArray(parsed.weights) && typeof parsed.bias === 'number') {
        _cached = parsed;
        return _cached;
      }
    }
  } catch {
    /* fall through to neutral */
  }
  _cached = NEUTRAL_MODEL;
  return _cached;
}

export function invalidateModelCache(): void {
  _cached = null;
}

export async function getModelInfo(): Promise<ModelInfo> {
  const path = getModelPath();
  const downloaded = getSetting('model_downloaded');
  if (!downloaded) return { version: '—', source: 'none', weightCount: 0 };
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const model = await loadModel();
      return {
        version: model.version,
        source: 'downloaded',
        weightCount: model.weights.length,
      };
    }
  } catch {
    /* non-fatal */
  }
  return { version: '—', source: 'none', weightCount: 0 };
}

export async function downloadModel(opts: DownloadOptions = {}): Promise<void> {
  const url = opts.url ?? DEFAULT_MODEL_URL;
  const dest = getModelPath();

  const progressCb = opts.onProgress
    ? ({ totalBytesWritten, totalBytesExpectedToWrite }: FileSystem.DownloadProgressData) => {
        if (totalBytesExpectedToWrite > 0) {
          opts.onProgress!(totalBytesWritten / totalBytesExpectedToWrite);
        }
      }
    : undefined;

  const dl = FileSystem.createDownloadResumable(url, dest, {}, progressCb);
  const result = await dl.downloadAsync();
  if (!result?.uri) throw new Error('Download returned no URI');

  const text = await FileSystem.readAsStringAsync(result.uri);
  const parsed = JSON.parse(text) as ModelData;
  if (!parsed.version || !Array.isArray(parsed.weights) || typeof parsed.bias !== 'number') {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Invalid model file format');
  }

  setSetting('model_downloaded', true);
  setSetting('model_version', parsed.version);
  // Auto-enable at 30% blend if weight was previously 0
  if (getSetting('model_weight') === 0) setSetting('model_weight', 0.3);
  invalidateModelCache();
}

export async function deleteModel(): Promise<void> {
  try {
    await FileSystem.deleteAsync(getModelPath(), { idempotent: true });
  } catch {
    /* non-fatal */
  }
  setSetting('model_downloaded', false);
  setSetting('model_version', '');
  setSetting('model_weight', 0);
  invalidateModelCache();
}
