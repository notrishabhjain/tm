import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import type {
  NotificationData,
  PermissionStatus,
  CallTranscriptionStatus,
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
