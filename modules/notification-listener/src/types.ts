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

export type NotificationEvent = 'onNotification' | 'onQuickActionDoneTop' | 'onQuickActionOpen';
