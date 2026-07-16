export interface ThreadMessage {
  sender: string;
  text: string;
  timestamp: number;
}

export interface NotificationData {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  postTime: number;
  notificationKey: string; // stable Android sbn.key — used for deduplication
  isGroup: boolean;
  // MessagingStyle thread — last N messages from the conversation
  thread: ThreadMessage[];
  // Android metadata
  category: string;
  channelId: string;
  importance: number;
}

export type PermissionStatus = 'granted' | 'denied' | 'unknown';

export interface CallTranscriptionStatus {
  enabled: boolean;
  hasPhoneStatePermission: boolean;
  hasCallLogPermission: boolean;
  hasAllFilesAccess: boolean;
  apiKeySet: boolean;
  /** True when the Sarvam (Hindi-specialist) transcription key is configured. */
  sarvamKeySet: boolean;
  /** True when the Gemini (one-call audio→tasks) engine is available. */
  geminiKeySet: boolean;
}

export interface ListenerHealth {
  /** Notification access is granted in system settings. */
  granted: boolean;
  /** The system actually has the listener bound right now (ground truth). */
  connected: boolean;
}

export interface CallDirReport {
  path: string;
  exists: boolean;
  isDirectory: boolean;
  canRead: boolean;
  audioFileCount: number;
}

export interface CallRecordingReport {
  name: string;
  path: string;
  ageMs: number;
  sizeBytes: number;
}

export interface CallDiagnostics {
  enabled: boolean;
  monitorRegistered: boolean;
  foregroundServiceRunning: boolean;
  hasPhoneStatePermission: boolean;
  hasCallLogPermission: boolean;
  hasAllFilesAccess: boolean;
  apiKeySet: boolean;
  lastProcessedPath: string | null;
  latestUnprocessedPath: string | null;
  latestUnprocessedAgeMs: number | null;
  dirs: CallDirReport[];
  recentRecordings: CallRecordingReport[];
}

export interface OemInfo {
  manufacturer: string;
  brand: string;
  oem: 'xiaomi' | 'oppo' | 'vivo' | 'huawei' | 'samsung' | 'other';
  /** OEM battery manager kills background triggers unless Autostart is granted. */
  needsAutostart: boolean;
}

export interface CallTranscriptionTestResult {
  ok: boolean;
  stage: 'find' | 'apikey' | 'network' | 'decode' | 'transcribe';
  recordingPath?: string;
  recordingAgeMs?: number;
  decodedSamples?: number;
  decodeMs?: number;
  transcribeMs?: number;
  transcript?: string;
  error?: string;
}
