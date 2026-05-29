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

export type NotificationEvent = 'onNotification' | 'onQuickActionDoneTop' | 'onQuickActionOpen';
