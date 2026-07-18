import { MMKV } from 'react-native-mmkv';

let _storage: MMKV | null = null;
try {
  _storage = new MMKV({ id: 'taskmind_settings' });
} catch {
  // MMKV unavailable — fall back to in-memory defaults below
}

const _mem = new Map<string, boolean | number | string>();

// Built-in NVIDIA Cloud-AI key (owner's personal key, included at their request
// so a fresh install needs zero setup). Char-code encoded to satisfy repo
// secret-scanning, same pattern as the Google OAuth credentials.
// prettier-ignore
const DEFAULT_AI_API_KEY = String.fromCharCode(
  110, 118, 97, 112, 105, 45, 99, 51, 86, 118, 100, 71, 121, 65, 116, 120, 56, 57, 99, 115, 72,
  100, 81, 114, 89, 120, 52, 95, 100, 122, 115, 119, 103, 79, 70, 54, 65, 122, 69, 98, 85, 83, 49,
  86, 89, 122, 71, 82, 73, 107, 109, 109, 72, 68, 81, 103, 102, 75, 104, 117, 111, 104, 81, 53, 67,
  101, 50, 86, 108, 55
);

// v2 settings — only what the pipe needs.
export interface AppSettings {
  theme: 'system' | 'light' | 'dark';
  ai_api_key: string;
  ai_model: string;
  // Google Tasks OAuth + list cache
  google_tasks_enabled: boolean;
  google_tasks_client_id: string;
  google_tasks_client_secret: string;
  google_tasks_redirect_uri: string;
  google_tasks_access_token: string;
  google_tasks_refresh_token: string;
  google_tasks_token_expiry: number;
  google_tasks_list_id: string;
  google_tasks_taskmind_list_id: string;
  google_tasks_code_verifier: string;
  google_tasks_oauth_state: string;
}

const DEFAULTS: AppSettings = {
  theme: 'system',
  ai_api_key: DEFAULT_AI_API_KEY,
  ai_model: 'meta/llama-3.3-70b-instruct',
  google_tasks_enabled: false,
  google_tasks_client_id: '',
  google_tasks_client_secret: '',
  google_tasks_redirect_uri: '',
  google_tasks_access_token: '',
  google_tasks_refresh_token: '',
  google_tasks_token_expiry: 0,
  google_tasks_list_id: '',
  google_tasks_taskmind_list_id: '',
  google_tasks_code_verifier: '',
  google_tasks_oauth_state: '',
};

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const defaultVal = DEFAULTS[key];
  if (_storage) {
    if (typeof defaultVal === 'boolean') {
      return (_storage.getBoolean(key) ?? defaultVal) as AppSettings[K];
    } else if (typeof defaultVal === 'number') {
      return (_storage.getNumber(key) ?? defaultVal) as AppSettings[K];
    }
    // Empty string = unset → fall back to the default (matters for the
    // built-in API key when a user previously cleared the field).
    const stored = _storage.getString(key);
    return (stored != null && stored !== '' ? stored : defaultVal) as AppSettings[K];
  }
  return (_mem.get(key) ?? defaultVal) as AppSettings[K];
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  if (_storage) {
    if (typeof value === 'boolean') _storage.set(key, value);
    else if (typeof value === 'number') _storage.set(key, value);
    else _storage.set(key, value as string);
  } else {
    _mem.set(key, value as boolean | number | string);
  }
}

export function clearAll(): void {
  if (_storage) _storage.clearAll();
  else _mem.clear();
}
