export interface NotificationData {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  postTime: number;
  isGroup: boolean;
}

export interface PersistentNotificationParams {
  pendingCount: number;
  urgentCount: number;
  topTaskText: string;
  secondTaskText: string | null;
}

export type PermissionStatus = 'granted' | 'denied' | 'unknown';

export type NotificationEvent = 'onNotification' | 'onQuickActionDoneTop' | 'onQuickActionOpen';
