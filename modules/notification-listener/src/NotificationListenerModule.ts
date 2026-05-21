import { requireNativeModule, EventEmitter } from 'expo-modules-core';
import type {
  NotificationData,
  PersistentNotificationParams,
  PermissionStatus,
  ManualTriggerData,
  AccessibilityCaptureData,
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

  getLastShareIntent(): Promise<{ text: string; subject: string | null } | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.getLastShareIntent() as Promise<{
      text: string;
      subject: string | null;
    } | null>;
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

  getLatestScreenshot(): Promise<string | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.getLatestScreenshot() as Promise<string | null>;
  },

  clearLatestScreenshot(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.clearLatestScreenshot() as Promise<void>;
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

  addQuickActionOpenListener(listener: () => void) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onQuickActionOpen', listener) as { remove: () => void };
  },

  addManualTriggerListener(listener: (data: ManualTriggerData) => void) {
    if (!emitter) return { remove: () => undefined };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (emitter as any).addListener('onManualTrigger', listener) as { remove: () => void };
  },

  getPendingCapture(): Promise<AccessibilityCaptureData | null> {
    if (!NativeModule) return Promise.resolve(null);
    return NativeModule.getPendingCapture() as Promise<AccessibilityCaptureData | null>;
  },

  clearPendingCapture(): Promise<void> {
    if (!NativeModule) return Promise.resolve();
    return NativeModule.clearPendingCapture() as Promise<void>;
  },
};

export default NotificationListenerModule;
