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

/** Stage counters since install — the gap between stages locates lost notifications. */
export interface ListenerStats {
  stat_seen: number;
  stat_summary: number;
  stat_unmonitored: number;
  stat_discarded: number;
  stat_dedup: number;
  stat_live: number;
  stat_headless: number;
  stat_queued: number;
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

/**
 * Result of the on-device notification classifier.
 *
 * `confidence` (0..1) is the gate input in task-intake.ts: high values are
 * auto-created, the middle band queues for review, and low values are dropped.
 * The heuristic classifier deliberately never returns 1.0 — see
 * LocalNotificationDecider.HEURISTIC_CEILING.
 */
export interface LocalDecision {
  isTask: boolean;
  title: string | null;
  priority: string;
  reasoning: string;
  notes: string | null;
  confidence: number;
  dueDate: number | null;
}

/** One recording and the transcript (if any) the device recorder produced for it. */
export interface TranscriptPair {
  recording: string;
  recordingModified: number;
  transcriptFound: boolean;
  transcriptPath: string;
  transcriptChars: number;
  preview: string;
}

/** A text-shaped file found in the recorder's storage tree. */
export interface LooseTextFile {
  path: string;
  bytes: number;
  modified: number;
  readable: boolean;
}

/**
 * Result of scanning for recorder-produced transcripts.
 *
 * `looseTextFiles` matters as much as `pairs`: if the recorder uses a naming
 * convention we do not recognise, the file still shows up there, which is how
 * the real layout gets confirmed rather than guessed.
 */
export interface RecorderTranscriptScan {
  recordingsChecked: number;
  pairs: TranscriptPair[];
  looseTextFiles: LooseTextFile[];
  rootsSearched: string[];
  error?: string;
}

/** Where call transcripts are allowed to come from. */
export interface TranscriptSourcePrefs {
  /** Prefer a transcript the phone's own recorder app produced. */
  useRecorderTranscript: boolean;
  /** Allow TaskMind to transcribe the audio itself when no such transcript exists. */
  ownAsrEnabled: boolean;
}

/** State of the UI-automation (accessibility) service. */
export interface AutomationStatus {
  /** The user has enabled TaskMind in Android's Accessibility settings. */
  enabled: boolean;
  /** The system currently has the service bound. */
  connected: boolean;
  /** Package name of the recorder app found on this device, or ''. */
  recorderPackage: string;
  recorderFound: boolean;
}

/** One control found on screen by the inspector. */
export interface InspectedNode {
  depth: number;
  text: string;
  desc: string;
  viewId: string;
  class: string;
  clickable: boolean;
  scrollable: boolean;
  enabled: boolean;
}

/**
 * Dump of the foreground window.
 *
 * This is how the automation gets written against reality: another app's labels
 * and view ids cannot be known from outside, so they are read off the device.
 */
export interface ScreenInspection {
  package?: string;
  nodes?: InspectedNode[];
  error?: string;
}

/** Outcome of an automation run. */
export interface AutomationResult {
  ok: boolean;
  /** Which step failed, when the run did not finish. */
  error: string;
  /** Step-by-step trace — the only way to see where a broken script went wrong. */
  log: string[];
  /** Text read off the screen, when the script collected any. */
  captured: string;
}
