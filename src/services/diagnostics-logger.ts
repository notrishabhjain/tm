import { getSetting, setSetting } from '@/data/storage/settings';
import type { NotificationData } from '../../modules/notification-listener/src/types';
import type { ExtractionDecision, Language } from '@/domain/types';

const BUFFER_SIZE = 50;

export interface CapturedNotification extends NotificationData {
  status: 'PASSED' | 'FILTERED' | 'DEDUPLICATED';
  capturedAt: number;
}

export interface ExtractionDecisionLog {
  input: string;
  language: Language;
  ruleScore: number;
  modelScore: number | null;
  finalScore: number;
  matchedKeywords: string[];
  decision: ExtractionDecision;
  timestamp: number;
}

export function logCapturedNotification(
  data: NotificationData,
  status: CapturedNotification['status']
): void {
  const buffer = getNotificationBuffer();
  const updated = [{ ...data, status, capturedAt: Date.now() }, ...buffer].slice(0, BUFFER_SIZE);
  setSetting('diag_notification_buffer', JSON.stringify(updated));
}

export function logExtractionDecision(decision: ExtractionDecisionLog): void {
  const buffer = getExtractionBuffer();
  const updated = [decision, ...buffer].slice(0, BUFFER_SIZE);
  setSetting('diag_extraction_buffer', JSON.stringify(updated));
}

export function getNotificationBuffer(): CapturedNotification[] {
  try {
    const raw = getSetting('diag_notification_buffer');
    return JSON.parse(raw) as CapturedNotification[];
  } catch {
    return [];
  }
}

export function getExtractionBuffer(): ExtractionDecisionLog[] {
  try {
    const raw = getSetting('diag_extraction_buffer');
    return JSON.parse(raw) as ExtractionDecisionLog[];
  } catch {
    return [];
  }
}

export function clearDiagnostics(): void {
  setSetting('diag_notification_buffer', '[]');
  setSetting('diag_extraction_buffer', '[]');
}
