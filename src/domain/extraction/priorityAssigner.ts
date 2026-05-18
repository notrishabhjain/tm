import type { Priority } from '../entities/Task';
import type { RuleEngineResult } from './types';

/**
 * Stage 5: Assign priority based on matched keyword categories.
 *
 * Rules per SRS FR-PR-02 (first match wins):
 * 1. VIP sender → URGENT (handled upstream, not here)
 * 2. URGENCY with critical flag → URGENT
 * 3. URGENCY + DEADLINE → HIGH
 * 4. URGENCY alone → HIGH
 * 5. IMPERATIVE alone → MEDIUM
 * 6. Otherwise → LOW
 */
export function assignPriority(ruleResult: RuleEngineResult): Priority {
  if (ruleResult.hasUrgency && ruleResult.hasDeadline) return 'HIGH';
  if (ruleResult.hasUrgency) return 'HIGH';
  if (ruleResult.hasImperative) return 'MEDIUM';
  return 'LOW';
}
