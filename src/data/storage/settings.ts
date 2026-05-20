import { MMKV } from 'react-native-mmkv';

let _storage: MMKV | null = null;
try {
  _storage = new MMKV({ id: 'taskmind_settings' });
} catch {
  // MMKV unavailable — fall back to in-memory defaults below
}

const _mem = new Map<string, boolean | number | string>();

export interface AppSettings {
  onboarding_complete: boolean;
  db_seeded: boolean;
  theme: 'system' | 'light' | 'dark';
  language: string;
  nudge_freq_minutes: number;
  quiet_hours_start: string;
  quiet_hours_end: string;
  urgent_override_quiet: boolean;
  rule_weight: number;
  model_weight: number;
  model_downloaded: boolean;
  model_version: string;
  email_enabled: boolean;
  email_send_time: string;
  auto_backup_enabled: boolean;
  diag_notification_buffer: string;
  diag_extraction_buffer: string;
}

const DEFAULTS: AppSettings = {
  onboarding_complete: false,
  db_seeded: false,
  theme: 'system',
  language: 'en',
  nudge_freq_minutes: 60,
  quiet_hours_start: '22:00',
  quiet_hours_end: '07:00',
  urgent_override_quiet: true,
  rule_weight: 1.0,
  model_weight: 0.0,
  model_downloaded: false,
  model_version: '',
  email_enabled: false,
  email_send_time: '21:00',
  auto_backup_enabled: true,
  diag_notification_buffer: '[]',
  diag_extraction_buffer: '[]',
};

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
  const defaultVal = DEFAULTS[key];
  if (_storage) {
    if (typeof defaultVal === 'boolean') {
      return (_storage.getBoolean(key) ?? defaultVal) as AppSettings[K];
    } else if (typeof defaultVal === 'number') {
      return (_storage.getNumber(key) ?? defaultVal) as AppSettings[K];
    }
    return (_storage.getString(key) ?? defaultVal) as AppSettings[K];
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
