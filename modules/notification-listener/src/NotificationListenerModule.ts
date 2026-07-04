import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import type {
  NotificationData,
  PersistentNotificationParams,
  PermissionStatus,
  FocusState,
  CallTranscriptionStatus,
  CallTranscriptReadyEvent,
  CallDiagnostics,
  CallTranscriptionTestResult,
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

  getMonitoredApps(): Promise<string[]> {
    if (!NativeModule) return Promise.resolve([]);
    return NativeModule.getMonitoredApps() as Promise<string[]>;
  },

  updatePersistentNotification(params: PersistentNotificationParams): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.updatePersistentNotification(params) as Promise<void>;
  },

  hidePersistentNotification(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.hidePersistentNotification() as Promise<void>;
  },

  updateWidget(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.updateWidget() as Promise<void>;
  },

  peekShareIntent(): Promise<{ text: string; subject: string | null } | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.peekShareIntent() as Promise<{
      text: string;
      subject: string | null;
    } | null>;
  },

  clearShareIntent(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.clearShareIntent() as Promise<void>;
  },

  scanActiveNotifications(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.scanActiveNotifications() as Promise<void>;
  },

  focusGetState(): Promise<FocusState> {
    if (!NativeModule)
      return Promise.resolve({
        enabled: false,
        sessionEndsAt: 0,
        bypassesLeft: 0,
        maxBypasses: 3,
        hasOverlayPermission: false,
        accessibilityEnabled: false,
        lockActive: false,
      });
    return NativeModule.focusGetState() as Promise<FocusState>;
  },

  focusSetEnabled(enabled: boolean): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.focusSetEnabled(enabled) as Promise<void>;
  },

  focusStartSession(minutes: number): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.focusStartSession(minutes) as Promise<void>;
  },

  focusEndSession(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.focusEndSession() as Promise<void>;
  },

  focusGetBlockApps(): Promise<string[]> {
    if (!NativeModule) return Promise.resolve([]);
    return NativeModule.focusGetBlockApps() as Promise<string[]>;
  },

  focusSetBlockApps(packages: string[]): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.focusSetBlockApps(packages) as Promise<void>;
  },

  requestOverlayPermission(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.requestOverlayPermission() as Promise<void>;
  },

  openAccessibilitySettings(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.openAccessibilitySettings() as Promise<void>;
  },

  addNotificationListener(listener: (data: NotificationData) => void) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onNotification', listener) as { remove: () => void };
  },

  addQuickActionDoneTopListener(listener: () => void) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onQuickActionDoneTop', listener) as { remove: () => void };
  },

  // ── In-app call transcription (replaces Termux + MacroDroid) ─────────────

  getCallTranscriptionStatus(): Promise<CallTranscriptionStatus> {
    if (!NativeModule) {
      return Promise.resolve({
        enabled: false,
        hasPhoneStatePermission: false,
        hasCallLogPermission: false,
        hasAllFilesAccess: false,
        apiKeySet: false,
      });
    }
    return NativeModule.getCallTranscriptionStatus() as Promise<CallTranscriptionStatus>;
  },

  setNvidiaApiKey(key: string): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setNvidiaApiKey(key) as Promise<void>;
  },

  getNvidiaApiKey(): Promise<string> {
    if (!NativeModule) return Promise.resolve('');
    return NativeModule.getNvidiaApiKey() as Promise<string>;
  },

  // Mirrors the MMKV Cloud-AI settings into native SharedPreferences so the
  // background call pipeline can run LLM extraction with the app dead.
  setAiCredentials(key: string, model: string): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.setAiCredentials(key, model) as Promise<void>;
  },

  // One-shot navigation route stashed by the native pipeline / notification
  // taps. Returns the route and clears it, or null when there is none.
  popPendingNavRoute(): Promise<string | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.popPendingNavRoute() as Promise<string | null>;
  },

  addCallRecordReadyListener(
    listener: (data: { recordId: string; callerLabel: string; taskCount: number }) => void
  ) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onCallRecordReady', listener) as { remove: () => void };
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

  peekPendingCallTranscript(): Promise<{
    text: string;
    callTime: number;
    callerLabel: string;
  } | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.peekPendingCallTranscript() as Promise<{
      text: string;
      callTime: number;
      callerLabel: string;
    } | null>;
  },

  clearPendingCallTranscript(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.clearPendingCallTranscript() as Promise<void>;
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

  addCallTranscriptReadyListener(listener: (data: CallTranscriptReadyEvent) => void) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onCallTranscriptReady', listener) as {
      remove: () => void;
    };
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
