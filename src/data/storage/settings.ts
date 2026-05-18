import { MMKV } from 'react-native-mmkv';

const storage = new MMKV({ id: 'taskmind_settings' });

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
  if (typeof defaultVal === 'boolean') {
    return (storage.getBoolean(key) ?? defaultVal) as AppSettings[K];
  } else if (typeof defaultVal === 'number') {
    return (storage.getNumber(key) ?? defaultVal) as AppSettings[K];
  }
  return (storage.getString(key) ?? defaultVal) as AppSettings[K];
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
  if (typeof value === 'boolean') storage.set(key, value);
  else if (typeof value === 'number') storage.set(key, value);
  else storage.set(key, value as string);
}

export function clearAll(): void {
  storage.clearAll();
}
