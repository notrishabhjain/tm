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

  addNotificationListener(listener: (data: NotificationData) => void) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onNotification', listener) as { remove: () => void };
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
