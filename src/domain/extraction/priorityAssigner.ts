import type { Priority } from '../types';

export interface RuleMatchSummary {
  hasImperative: boolean;
  hasUrgency: boolean;
  hasDeadline: boolean;
  urgencyWeight: number;
}

export function assignPriority(matches: RuleMatchSummary, isVipSender: boolean): Priority {
  if (isVipSender) return 'URGENT';
  if (matches.urgencyWeight >= 1.5) return 'URGENT';
  if (matches.hasUrgency && matches.hasDeadline) return 'HIGH';
  if (matches.hasUrgency) return 'HIGH';
  if (matches.hasImperative && matches.hasDeadline) return 'HIGH';
  if (matches.hasImperative) return 'MEDIUM';
  return 'LOW';
}
