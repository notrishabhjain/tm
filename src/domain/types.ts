export type Priority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export type TaskStatus = 'PENDING' | 'COMPLETE' | 'ARCHIVED';

export type Language = 'EN' | 'HI' | 'HI-EN';

export type ExtractionDecision = 'CREATE' | 'CONFIRM' | 'DISCARD';

export type DiscardReason =
  | 'LOW_CONFIDENCE'
  | 'ANTI_PATTERN'
  | 'TOO_SHORT'
  | 'FILTERED'
  | 'USER_REJECTED'
  | 'SPAM_OR_OTP'
  | 'AI_DISCARD';

export interface Task {
  id: string;
  title: string;
  body: string | null;
  sourceApp: string;
  sender: string | null;
  priority: Priority;
  status: TaskStatus;
  confidence: number;
  needsConfirmation: boolean;
  dueDate: number | null;
  screenshotPath: string | null;
  createdAt: number;
  completedAt: number | null;
  deletedAt: number | null;
}

export interface NotificationData {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  postTime: number;
  notificationKey: string;
  isGroup: boolean;
}

export interface ExtractionResult {
  decision: ExtractionDecision;
  priority: Priority;
  confidence: number;
  language: Language;
  ruleScore: number;
  modelScore: number | null;
  matchedKeywords: string[];
  extractedTitle: string;
  dueDate?: number | null;
  discardReason?: DiscardReason;
}

export interface PersistentNotificationParams {
  pendingCount: number;
  urgentCount: number;
  topTaskText: string;
  secondTaskText: string | null;
}

export interface VipContact {
  id: string;
  identifier: string;
  displayName: string;
  sourceApp: string;
  createdAt: number;
}

export interface MonitoredApp {
  id: string;
  packageName: string;
  displayName: string;
  isActive: boolean;
  createdAt: number;
}

export interface SeedKeyword {
  id: string;
  keyword: string;
  language: Language;
  priorityHint: Priority;
  createdAt: number;
}

export interface SenderStats {
  id: string;
  senderKey: string;
  confirmCount: number;
  rejectCount: number;
  autoAcceptCount: number;
  lastSeenAt: number;
  tier: string;
  seedTrust: number | null;
}

export interface DiscardedLogEntry {
  id: string;
  notificationId: string;
  notificationKey: string | null;
  sourceApp: string;
  sender: string | null;
  bodyPreview: string;
  reason: DiscardReason;
  confidence: number;
  createdAt: number;
}
