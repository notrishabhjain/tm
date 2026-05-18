import type { Language, Priority } from '../entities/Task';

/** Raw notification data forwarded from the native module. */
export interface NotificationInput {
  packageName: string;
  appName: string;
  title: string;
  text: string;
  bigText: string;
  subText: string;
  postTime: number;
  isGroup: boolean;
}

/** Result of the language detection stage. */
export interface LanguageDetectionResult {
  language: Language;
  hasDevanagari: boolean;
  hasLatin: boolean;
}

/** Result of the preprocessing stage. */
export interface PreprocessResult {
  normalized: string; // lowercase, NFC-normalized
  original: string;   // raw source (rawSourceText)
  wordCount: number;
}

/** A matched keyword with its category and weight. */
export interface MatchedKeyword {
  phrase: string;
  category: KeywordCategory;
  language: Language;
  weight: number;
}

export const KeywordCategory = {
  IMPERATIVE: 'IMPERATIVE',
  URGENCY: 'URGENCY',
  DEADLINE: 'DEADLINE',
  REQUEST: 'REQUEST',
  ANTI_PATTERN: 'ANTI_PATTERN',
  DOMAIN: 'DOMAIN',
} as const;
export type KeywordCategory = (typeof KeywordCategory)[keyof typeof KeywordCategory];

/** Result of the rule engine stage. */
export interface RuleEngineResult {
  score: number; // [0.0, 1.0]
  matchedKeywords: MatchedKeyword[];
  hasImperative: boolean;
  hasUrgency: boolean;
  hasDeadline: boolean;
  hasAntiPattern: boolean;
}

/** Result of the ML model inference stage (optional). */
export interface ModelInferenceResult {
  label: 'TASK' | 'NOT_TASK';
  confidence: number; // [0.0, 1.0]
}

/** The final extraction decision. */
export type ExtractionDecision = 'CREATE' | 'CONFIRM' | 'DISCARD';

/** The reason a notification was discarded. */
export type DiscardReason = 'LOW_CONFIDENCE' | 'ANTI_PATTERN' | 'TOO_SHORT';

/** Full output of the extraction pipeline. */
export interface ExtractionResult {
  decision: ExtractionDecision;
  extractedText: string;
  priority: Priority;
  confidence: number;
  ruleScore: number;
  modelScore: number | null;
  language: Language;
  matchedKeywords: MatchedKeyword[];
  discardReason: DiscardReason | null;
}

/** Confidence thresholds. */
export const CONFIDENCE_THRESHOLDS = {
  AUTO_CREATE: 0.75,
  NEEDS_CONFIRMATION: 0.40,
  VIP_OVERRIDE: 0.30,
  TRANSCRIPT: 0.55,
} as const;
