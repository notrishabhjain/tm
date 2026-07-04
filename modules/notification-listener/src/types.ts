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
  // Android metadata for app-context scoring
  category: string; // CATEGORY_MESSAGE, CATEGORY_EMAIL, etc.
  channelId: string;
  importance: number; // 0-5 (IMPORTANCE_NONE to IMPORTANCE_HIGH)
}

export interface PersistentNotificationParams {
  pendingCount: number;
  urgentCount: number;
  taskTexts: string[];
}

export type PermissionStatus = 'granted' | 'denied' | 'unknown';

export interface FocusState {
  enabled: boolean; // auto-lock on URGENT tasks
  sessionEndsAt: number; // epoch ms of an active manual session (0 = none)
  bypassesLeft: number; // timed bypasses remaining today
  maxBypasses: number;
  hasOverlayPermission: boolean; // SYSTEM_ALERT_WINDOW granted
  accessibilityEnabled: boolean; // accessibility service enabled
  lockActive: boolean; // lock currently in effect right now
}

export type NotificationEvent = 'onNotification' | 'onQuickActionDoneTop';

export interface CallTranscriptionStatus {
  enabled: boolean;
  hasPhoneStatePermission: boolean;
  hasCallLogPermission: boolean;
  hasAllFilesAccess: boolean;
  apiKeySet: boolean;
  autoOpenEnabled: boolean;
  hasOverlayPermission: boolean;
  hasMicPermission: boolean;
}

export interface CallTranscriptReadyEvent {
  text: string;
  callTime: number;
  callerLabel: string;
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
