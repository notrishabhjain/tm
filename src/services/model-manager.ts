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
  source: 'seed' | 'downloaded' | 'none';
  weightCount: number;
}

export interface DownloadOptions {
  url?: string;
  onProgress?: (fraction: number) => void;
}

const MODEL_FILENAME = 'intent-classifier.json';

export const DEFAULT_MODEL_URL =
  'https://github.com/notrishabhjain/tm/releases/download/models/intent-classifier-v1.json';

export function getModelPath(): string {
  return `${FileSystem.documentDirectory ?? ''}${MODEL_FILENAME}`;
}

// Bundled seed model loaded from app assets — always available, no download needed.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const SEED_MODEL: ModelData = require('../../assets/models/intent-seed-model.json') as ModelData;

let _cached: ModelData | null = null;

export async function loadModel(): Promise<ModelData> {
  if (_cached) return _cached;

  // Try downloaded model first (may be a newer version than seed)
  const path = getModelPath();
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists) {
      const json = await FileSystem.readAsStringAsync(path);
      const parsed = JSON.parse(json) as ModelData;
      if (
        Array.isArray(parsed.weights) &&
        parsed.weights.length > 0 &&
        typeof parsed.bias === 'number'
      ) {
        _cached = parsed;
        return _cached;
      }
    }
  } catch {
    /* fall through to seed */
  }

  _cached = SEED_MODEL;
  return _cached;
}

export function invalidateModelCache(): void {
  _cached = null;
}

export async function getModelInfo(): Promise<ModelInfo> {
  const path = getModelPath();
  const downloaded = getSetting('model_downloaded');

  if (downloaded) {
    try {
      const info = await FileSystem.getInfoAsync(path);
      if (info.exists) {
        const model = await loadModel();
        if (model !== SEED_MODEL) {
          return {
            version: model.version,
            source: 'downloaded',
            weightCount: model.weights.length,
          };
        }
      }
    } catch {
      /* fall through */
    }
  }

  return {
    version: SEED_MODEL.version,
    source: 'seed',
    weightCount: SEED_MODEL.weights.filter((w) => w !== 0).length,
  };
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
  let parsed: ModelData;
  try {
    parsed = JSON.parse(text) as ModelData;
  } catch {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Server returned an invalid response — check the model URL');
  }

  if (
    !parsed.version ||
    !Array.isArray(parsed.weights) ||
    parsed.weights.length === 0 ||
    typeof parsed.bias !== 'number'
  ) {
    await FileSystem.deleteAsync(dest, { idempotent: true });
    throw new Error('Downloaded file is not a valid model (missing version, weights, or bias)');
  }

  setSetting('model_downloaded', true);
  setSetting('model_version', parsed.version);
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
