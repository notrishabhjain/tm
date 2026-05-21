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

export type NotificationEvent =
  | 'onNotification'
  | 'onQuickActionDoneTop'
  | 'onQuickActionOpen'
  | 'onManualTrigger';

export interface ManualTriggerData {
  packageName: string;
  extractedText: string;
  sender: string;
  screenshotPath: string;
}

export interface AccessibilityCaptureData {
  packageName: string;
  extractedText: string;
  sender: string;
  screenshotPath: string;
  timestamp: number;
}
