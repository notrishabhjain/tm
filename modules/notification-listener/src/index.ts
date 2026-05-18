import NotificationListenerModule from './NotificationListenerModule';
import type {
  NotificationData,
  PersistentNotificationParams,
  PermissionStatus,
  QuickActionEventType,
} from './NotificationListener.types';

export type {
  NotificationData,
  PersistentNotificationParams,
  PermissionStatus,
  QuickActionEventType,
};

/**
 * Get the current Notification Listener Service permission status.
 * Returns 'granted' | 'denied' | 'unknown'
 */
export function getPermissionStatus(): Promise<PermissionStatus> {
  return NotificationListenerModule.getPermissionStatus();
}

/**
 * Open Android's Notification Access settings so the user can grant permission.
 */
export function openPermissionSettings(): Promise<void> {
  return NotificationListenerModule.openPermissionSettings();
}

/**
 * Start the TaskMind foreground service (which also keeps the JS runtime alive
 * for Headless JS notification processing).
 */
export function startService(): Promise<void> {
  return NotificationListenerModule.startService();
}

/**
 * Stop the TaskMind foreground service.
 */
export function stopService(): Promise<void> {
  return NotificationListenerModule.stopService();
}

/**
 * Returns true if the TaskMind foreground service is currently running.
 */
export function isServiceRunning(): Promise<boolean> {
  return NotificationListenerModule.isServiceRunning();
}

/**
 * Write the monitored-apps allowlist to SharedPreferences so the native
 * NotificationListenerService can filter notifications before bridging to JS.
 */
export function setMonitoredApps(packageNames: string[]): Promise<void> {
  return NotificationListenerModule.setMonitoredApps(packageNames);
}

/**
 * Read the current monitored-apps allowlist from SharedPreferences.
 */
export function getMonitoredApps(): Promise<string[]> {
  return NotificationListenerModule.getMonitoredApps();
}

/**
 * Update the persistent (non-dismissible) foreground notification content.
 * Called from JS whenever task state changes.
 */
export function updatePersistentNotification(
  params: PersistentNotificationParams,
): Promise<void> {
  return NotificationListenerModule.updatePersistentNotification(params);
}

/**
 * Hide the persistent notification. Should only be called when there are
 * zero pending tasks.
 */
export function hidePersistentNotification(): Promise<void> {
  return NotificationListenerModule.hidePersistentNotification();
}

export default NotificationListenerModule;
