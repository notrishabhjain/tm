import { runExtractionPipeline } from '@/domain/extraction';
import type { PipelineConfig } from '@/domain/extraction';
import type { Keyword } from '@/domain/extraction/ruleEngine';
import type { Priority } from '@/domain/types';
import seedKeywordsRaw from '../../assets/seed-keywords.json';

type RawKeyword = { keyword: string; language: string; priority_hint: string };

function priorityHintToCategory(hint: string): Keyword['category'] {
  if (hint === 'URGENT') return 'URGENCY';
  if (hint === 'HIGH') return 'IMPERATIVE';
  if (hint === 'MEDIUM') return 'IMPERATIVE';
  return 'ANTI_PATTERN';
}

const SEED_VOCABULARY: Keyword[] = (seedKeywordsRaw as RawKeyword[]).map((k) => ({
  phrase: k.keyword,
  category: priorityHintToCategory(k.priority_hint),
  language: k.language as Keyword['language'],
  weight: k.priority_hint === 'URGENT' ? 1.5 : k.priority_hint === 'HIGH' ? 1.2 : 1.0,
}));

const PIPELINE_CONFIG: PipelineConfig = {
  vocabulary: SEED_VOCABULARY,
  vipSenders: [],
  ruleWeight: 1.0,
  modelWeight: 0.0,
};

export interface QuickExtractResult {
  title: string | null; // cleaned imperative title, null if pipeline found none
  priority: Priority;
  dueDate: number | null;
}

/**
 * Rule-engine analysis of free text (dictated via the keyboard, shared from
 * another app, typed by hand): derives a cleaned title, priority, and due
 * date. Shared by the share screen and quick task creation.
 */
export async function analyzeQuickText(text: string, sender?: string): Promise<QuickExtractResult> {
  try {
    const result = await runExtractionPipeline(
      { text, title: sender || undefined },
      PIPELINE_CONFIG
    );
    return {
      title: result.extractedTitle || null,
      priority: result.priority,
      dueDate: result.dueDate ?? null,
    };
  } catch {
    return { title: null, priority: 'MEDIUM', dueDate: null };
  }
}
