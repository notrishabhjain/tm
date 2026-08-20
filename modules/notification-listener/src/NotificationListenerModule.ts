import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import type {
  NotificationData,
  PermissionStatus,
  CallTranscriptionStatus,
  CallDiagnostics,
  CallTranscriptionTestResult,
  OemInfo,
  ListenerHealth,
  ListenerStats,
  LocalDecision,
  RecorderTranscriptScan,
  TranscriptSourcePrefs,
  AutomationStatus,
  ScreenInspection,
  AutomationResult,
} from './types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let NativeModule: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let emitter: any = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  NativeModule = requireNativeModule<any>('NotificationListener');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  emitter = new EventEmitter(NativeModule);
} catch {
  // Native module unavailable — stub will return no-op results
}

const NotificationListenerModule = {
  // ── Notification listener ─────────────────────────────────────────────────

  getPermissionStatus(): Promise<PermissionStatus> {
    if (!NativeModule) return Promise.resolve('denied' as PermissionStatus);
    return NativeModule.getPermissionStatus() as Promise<PermissionStatus>;
  },

  openPermissionSettings(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.openPermissionSettings() as Promise<void>;
  },

  startService(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.startService() as Promise<void>;
  },

  stopService(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.stopService() as Promise<void>;
  },

  isServiceRunning(): Promise<boolean> {
    if (!NativeModule) return Promise.resolve(false);
    return NativeModule.isServiceRunning() as Promise<boolean>;
  },

  setMonitoredApps(packageNames: string[]): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setMonitoredApps(packageNames) as Promise<void>;
  },

  scanActiveNotifications(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.scanActiveNotifications() as Promise<void>;
  },

  // Replays notifications queued while JS was dead (OEM blocked headless start).
  drainPendingNotifications(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.drainPendingNotifications() as Promise<void>;
  },

  // ── UI automation (accessibility) ──────────────────────────────────────────

  getAutomationStatus(): Promise<AutomationStatus> {
    if (!NativeModule) {
      return Promise.resolve({
        enabled: false,
        connected: false,
        recorderPackage: '',
        recorderFound: false,
      });
    }
    return NativeModule.getAutomationStatus() as Promise<AutomationStatus>;
  },

  openAccessibilitySettings(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.openAccessibilitySettings() as Promise<void>;
  },

  /**
   * Dumps the controls on whatever is currently on screen. Used to read the
   * Recorder's real button labels and view ids, which cannot be guessed.
   */
  inspectForegroundScreen(): Promise<ScreenInspection> {
    if (!NativeModule) return Promise.resolve({ error: 'Native module unavailable' });
    return NativeModule.inspectForegroundScreen() as Promise<ScreenInspection>;
  },

  /** Stops an in-flight automation run at the next step boundary. */
  abortAutomation(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.abortAutomation() as Promise<void>;
  },

  /**
   * Drives the Recorder through transcription and copies the result.
   * `readOnScreen` uses the variant that reads text off the screen instead of
   * the three-dot Copy menu — fewer controls to match, less complete output.
   */
  runRecorderAutomation(
    recordingLabel: string | null,
    readOnScreen: boolean
  ): Promise<AutomationResult> {
    if (!NativeModule) {
      return Promise.resolve({
        ok: false,
        error: 'Native module unavailable',
        log: [],
        captured: '',
      });
    }
    return NativeModule.runRecorderAutomation(
      recordingLabel,
      readOnScreen
    ) as Promise<AutomationResult>;
  },

  addAutomationLogListener(listener: (e: { message: string; ts: number }) => void) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = (emitter as any).addListener('onAutomationLog', listener) as {
      remove: () => void;
    };
    return sub;
  },

  /**
   * True when the recorder app announced a finished transcription since the app
   * was last opened. Read-and-clear, so the prompt is acted on exactly once.
   */
  consumeTranscriptImportPending(): Promise<boolean> {
    if (!NativeModule) return Promise.resolve(false);
    return NativeModule.consumeTranscriptImportPending() as Promise<boolean>;
  },

  /**
   * Returns and clears a transcript shared into the app from the recorder app,
   * or an empty string when there is none. Cleared on read so the import screen
   * cannot re-present text the user has already dealt with.
   */
  consumeSharedTranscript(): Promise<string> {
    if (!NativeModule) return Promise.resolve('');
    return NativeModule.consumeSharedTranscript() as Promise<string>;
  },

  /**
   * Reports which transcripts the phone's own recorder app has produced and
   * which recordings they pair with. Used to confirm the recorder's storage
   * layout on a real device instead of hardcoding a guess.
   */
  scanRecorderTranscripts(): Promise<RecorderTranscriptScan | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.scanRecorderTranscripts() as Promise<RecorderTranscriptScan | null>;
  },

  /** Chooses where call transcripts may come from. */
  setTranscriptSourcePrefs(useRecorderTranscript: boolean, ownAsrEnabled: boolean): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setTranscriptSourcePrefs(
      useRecorderTranscript,
      ownAsrEnabled
    ) as Promise<void>;
  },

  getTranscriptSourcePrefs(): Promise<TranscriptSourcePrefs | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.getTranscriptSourcePrefs() as Promise<TranscriptSourcePrefs | null>;
  },

  // On-device classifier: Android TextClassifier (HyperOS AI on Xiaomi) plus
  // Hindi/English pattern matching. First stage of the v3 pipeline — `confidence`
  // (0..1) drives the auto-create / review / discard gate in task-intake.ts.
  // Returns null if the native module is unavailable.
  localDecideNotification(
    pkg: string,
    senderName: string,
    text: string,
    isGroup: boolean
  ): Promise<LocalDecision | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.localDecideNotification(
      pkg,
      senderName,
      text,
      isGroup
    ) as Promise<LocalDecision | null>;
  },

  addNotificationListener(listener: (data: NotificationData) => void) {
    if (!emitter) return { remove: () => undefined };
    // Signal native: a live JS listener is now registered. Native dispatch uses
    // this to distinguish "process alive via FGS but no listener" (swipe) from
    // "process alive AND JS is handling events" (app open).
    void NativeModule?.setNotificationListenerActive(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = (emitter as any).addListener('onNotification', listener) as { remove: () => void };
    return {
      remove: () => {
        void NativeModule?.setNotificationListenerActive(false);
        sub.remove();
      },
    };
  },

  // ── Confirmation notifications ────────────────────────────────────────────

  postConfirmation(title: string, text: string): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.postConfirmation(title, text) as Promise<void>;
  },

  // ── Call transcription ────────────────────────────────────────────────────

  getCallTranscriptionStatus(): Promise<CallTranscriptionStatus> {
    if (!NativeModule) {
      return Promise.resolve({
        enabled: false,
        hasPhoneStatePermission: false,
        hasCallLogPermission: false,
        hasAllFilesAccess: false,
        apiKeySet: false,
        sarvamKeySet: false,
        geminiKeySet: false,
      });
    }
    return NativeModule.getCallTranscriptionStatus() as Promise<CallTranscriptionStatus>;
  },

  /** Sarvam AI key for Hindi/Hinglish transcription; blank clears it. */
  setSarvamApiKey(key: string): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setSarvamApiKey(key) as Promise<void>;
  },

  /** Gemini key for the one-call audio→tasks engine; blank restores the default. */
  setGeminiApiKey(key: string): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setGeminiApiKey(key) as Promise<void>;
  },

  /** Effective Gemini key (user override or built-in default). */
  getGeminiApiKey(): Promise<string> {
    if (!NativeModule) return Promise.resolve('');
    return NativeModule.getGeminiApiKey() as Promise<string>;
  },

  /** Permission string vs. actual binding — they diverge after a crash. */
  getListenerHealth(): Promise<ListenerHealth> {
    if (!NativeModule) return Promise.resolve({ granted: false, connected: false });
    return NativeModule.getListenerHealth() as Promise<ListenerHealth>;
  },

  /** Stage counters since install; gaps between stages locate lost notifications. */
  getListenerStats(): Promise<ListenerStats> {
    if (!NativeModule) {
      return Promise.resolve({
        stat_seen: 0,
        stat_summary: 0,
        stat_unmonitored: 0,
        stat_discarded: 0,
        stat_dedup: 0,
        stat_live: 0,
        stat_headless: 0,
        stat_queued: 0,
      });
    }
    return NativeModule.getListenerStats() as Promise<ListenerStats>;
  },

  /** Asks the system to re-bind a granted-but-dead listener. */
  rebindListener(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.rebindListener() as Promise<void>;
  },

  /** "<epoch ms>|<type>: <message>\n<stack>" of the last fatal crash, or null. */
  getLastCrash(): Promise<string | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.getLastCrash() as Promise<string | null>;
  },

  clearLastCrash(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.clearLastCrash() as Promise<void>;
  },

  setNvidiaApiKey(key: string): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setNvidiaApiKey(key) as Promise<void>;
  },

  getNvidiaApiKey(): Promise<string> {
    if (!NativeModule) return Promise.resolve('');
    return NativeModule.getNvidiaApiKey() as Promise<string>;
  },

  setAiCredentials(key: string, model: string): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setAiCredentials(key, model) as Promise<void>;
  },

  setCallTranscriptionEnabled(enabled: boolean): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setCallTranscriptionEnabled(enabled) as Promise<void>;
  },

  setCallRecordingsDir(dir: string | null): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setCallRecordingsDir(dir) as Promise<void>;
  },

  requestCallTranscriptionPermissions(): Promise<boolean> {
    if (!NativeModule) return Promise.resolve(false);
    return NativeModule.requestCallTranscriptionPermissions() as Promise<boolean>;
  },

  openAllFilesAccessSettings(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.openAllFilesAccessSettings() as Promise<void>;
  },

  openAppSettings(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.openAppSettings() as Promise<void>;
  },

  getCallDiagnostics(): Promise<CallDiagnostics | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.getCallDiagnostics() as Promise<CallDiagnostics>;
  },

  runCallTranscriptionTest(): Promise<CallTranscriptionTestResult> {
    if (!NativeModule)
      return Promise.resolve({
        ok: false,
        stage: 'apikey',
        error: 'Native module unavailable',
      } as CallTranscriptionTestResult);
    return NativeModule.runCallTranscriptionTest() as Promise<CallTranscriptionTestResult>;
  },

  simulateCallEnded(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.simulateCallEnded() as Promise<void>;
  },

  // Recovery sweep: processes recent recordings missed by the call-ended
  // trigger (MIUI/HyperOS autostart restrictions). Dedups via the DB.
  scanForMissedCalls(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.scanForMissedCalls() as Promise<void>;
  },

  getOemInfo(): Promise<OemInfo> {
    if (!NativeModule) {
      return Promise.resolve({
        manufacturer: '',
        brand: '',
        oem: 'other',
        needsAutostart: false,
      } as OemInfo);
    }
    return NativeModule.getOemInfo() as Promise<OemInfo>;
  },

  /** Opens the OEM autostart screen; false = fell back to app details. */
  openAutostartSettings(): Promise<boolean> {
    if (!NativeModule) return Promise.resolve(false);
    return NativeModule.openAutostartSettings() as Promise<boolean>;
  },

  addCallTranscriptionTestLogListener(
    listener: (data: { stage: string; message: string; ts: number }) => void
  ) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onCallTranscriptionTestLog', listener) as {
      remove: () => void;
    };
  },
};

export default NotificationListenerModule;
