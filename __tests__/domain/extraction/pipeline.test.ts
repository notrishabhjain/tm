import { runExtractionPipeline } from '../../../src/domain/extraction';
import type { PipelineInput, PipelineConfig } from '../../../src/domain/extraction';
import type { Keyword } from '../../../src/domain/extraction/ruleEngine';

const VOCAB: Keyword[] = [
  { phrase: 'send', category: 'IMPERATIVE', language: 'EN', weight: 1.0 },
  { phrase: 'review', category: 'IMPERATIVE', language: 'EN', weight: 1.0 },
  { phrase: 'urgent', category: 'URGENCY', language: 'EN', weight: 1.5 },
  { phrase: 'by tomorrow', category: 'DEADLINE', language: 'EN', weight: 1.0 },
  { phrase: 'asap', category: 'URGENCY', language: 'EN', weight: 1.5 },
  { phrase: 'please', category: 'REQUEST', language: 'EN', weight: 0.5 },
  { phrase: 'lol', category: 'ANTI_PATTERN', language: 'EN', weight: 1.0 },
  { phrase: 'ok', category: 'ANTI_PATTERN', language: 'EN', weight: 1.0 },
  { phrase: 'bhej', category: 'IMPERATIVE', language: 'HI-EN', weight: 1.0 },
  { phrase: 'kal tak', category: 'DEADLINE', language: 'HI-EN', weight: 1.0 },
  { phrase: 'zaroor', category: 'URGENCY', language: 'HI-EN', weight: 1.5 },
];

const BASE_CONFIG: PipelineConfig = {
  vocabulary: VOCAB,
  vipSenders: [],
  ruleWeight: 1.0,
  modelWeight: 0.0,
};

function makeInput(overrides: Partial<PipelineInput> = {}): PipelineInput {
  return {
    text: 'Please send the report by tomorrow',
    title: 'Alice',
    sourceApp: 'com.whatsapp',
    ...overrides,
  };
}

describe('runExtractionPipeline', () => {
  it('auto-creates task for clear action message', async () => {
    const input = makeInput({
      text: 'please send the report urgent by tomorrow for the meeting',
    });
    const result = await runExtractionPipeline(input, BASE_CONFIG);
    expect(result.decision).toBe('CREATE');
    expect(result.confidence).toBeGreaterThanOrEqual(0.75);
  });

  it('discards noise — anti-pattern only', async () => {
    const input = makeInput({ text: 'lol', title: 'Bob' });
    const result = await runExtractionPipeline(input, BASE_CONFIG);
    expect(result.decision).toBe('DISCARD');
  });

  it('discards very short text', async () => {
    const input = makeInput({ text: 'ok', title: 'Bob' });
    const result = await runExtractionPipeline(input, BASE_CONFIG);
    expect(result.decision).toBe('DISCARD');
  });

  it('VIP sender promotes task regardless of score', async () => {
    const vipConfig: PipelineConfig = {
      ...BASE_CONFIG,
      vipSenders: ['alice'],
    };
    const input = makeInput({
      text: 'please send this when you can',
      title: 'Alice',
    });
    const result = await runExtractionPipeline(input, vipConfig);
    expect(['CREATE', 'CONFIRM']).toContain(result.decision);
    expect(result.priority).toBe('URGENT');
  });

  it('detects Hinglish language', async () => {
    const input = makeInput({
      text: 'kal tak bhej dena zaroor yaar',
      title: 'Bob',
    });
    const result = await runExtractionPipeline(input, BASE_CONFIG);
    expect(result.language).toBe('HI-EN');
  });

  it('includes matched keywords in result', async () => {
    const input = makeInput({
      text: 'please send the report by tomorrow',
    });
    const result = await runExtractionPipeline(input, BASE_CONFIG);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
  });

  it('assigns URGENT priority for urgency keyword', async () => {
    const input = makeInput({
      text: 'urgent please send the report right now asap',
    });
    const result = await runExtractionPipeline(input, BASE_CONFIG);
    expect(result.priority).toBe('URGENT');
  });

  it('assigns HIGH priority for deadline + imperative', async () => {
    const input = makeInput({
      text: 'send the proposal by tomorrow please review it carefully',
    });
    const result = await runExtractionPipeline(input, BASE_CONFIG);
    expect(['HIGH', 'URGENT']).toContain(result.priority);
  });

  it('returns result with all required fields', async () => {
    const result = await runExtractionPipeline(makeInput(), BASE_CONFIG);
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('confidence');
    expect(result).toHaveProperty('priority');
    expect(result).toHaveProperty('language');
    expect(result).toHaveProperty('matchedKeywords');
    expect(result).toHaveProperty('extractedTitle');
    expect(result).toHaveProperty('ruleScore');
    expect(result).toHaveProperty('modelScore');
  });

  it('model inferer is called and affects confidence', async () => {
    const modelConfig: PipelineConfig = {
      ...BASE_CONFIG,
      ruleWeight: 0.5,
      modelWeight: 0.5,
      modelInferer: async () => 0.95,
    };
    const input = makeInput({ text: 'please send the report' });
    const result = await runExtractionPipeline(input, modelConfig);
    expect(result.modelScore).toBe(0.95);
  });

  it('falls back to rule score when model times out', async () => {
    const slowModelConfig: PipelineConfig = {
      ...BASE_CONFIG,
      ruleWeight: 0.5,
      modelWeight: 0.5,
      modelInferer: async () => {
        await new Promise((r) => setTimeout(r, 1000));
        return 0.9;
      },
    };
    const result = await runExtractionPipeline(makeInput(), slowModelConfig);
    expect(result.modelScore).toBeNull();
  });
});
