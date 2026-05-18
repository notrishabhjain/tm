/**
 * Data extracted from an Android StatusBarNotification and forwarded to JS.
 * All fields are best-effort — some apps provide more extras than others.
 */
export interface NotificationData {
  /** Android package name, e.g. "com.whatsapp" */
  packageName: string;
  /** Human-readable app name resolved via PackageManager, e.g. "WhatsApp" */
  appName: string;
  /** Notification title — typically the sender name for messaging apps */
  title: string;
  /** Short notification text */
  text: string;
  /** Expanded BigText content (more complete message body) */
  bigText: string;
  /** Sub-text, typically the group/channel name */
  subText: string;
  /** Epoch milliseconds when the notification was posted */
  postTime: number;
  /** Heuristic: true when subText is non-empty OR notification group key is present */
  isGroup: boolean;
}

/** Parameters for updating the persistent foreground notification */
export interface PersistentNotificationParams {
  /** Total pending task count */
  pendingCount: number;
  /** Count of URGENT priority pending tasks */
  urgentCount: number;
  /** Text of the highest-priority pending task */
  topTaskText: string;
  /** Text of the second-highest-priority task, or null */
  secondTaskText: string | null;
}

/** Result of getPermissionStatus() */
export type PermissionStatus = 'granted' | 'denied' | 'unknown';

/** Events emitted by the native module */
export type QuickActionEventType =
  | 'onNotification'
  | 'onQuickActionDoneTop'
  | 'onQuickActionOpen';
