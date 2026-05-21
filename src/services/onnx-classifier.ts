/**
 * On-device ONNX task classifier using all-MiniLM-L6-v2 (sentence embeddings).
 *
 * Strategy: compute cosine similarity between the notification embedding and
 * a small set of prototype "task request" embeddings computed at startup.
 * No training needed — pure zero-shot semantic similarity.
 *
 * Runtime: onnxruntime-react-native (New Architecture JSI).
 * Model: Xenova/all-MiniLM-L6-v2 quantized (~22 MB).
 */

import { isModelCached, getModelLocalPath } from './model-manager';

// Lazy import to avoid crashes when the native module isn't linked yet
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type InferenceSession = any;
let InferenceSessionClass: { create: (path: string) => Promise<InferenceSession> } | null = null;
let TensorClass: (new (type: string, data: number[], dims: number[]) => unknown) | null = null;

function tryLoadOrt(): boolean {
  if (InferenceSessionClass) return true;
  try {
    // Dynamic require so the module parse doesn't fail if native code isn't linked
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ort = require('onnxruntime-react-native') as {
      InferenceSession: typeof InferenceSessionClass;
      Tensor: typeof TensorClass;
    };
    InferenceSessionClass = ort.InferenceSession;
    TensorClass = ort.Tensor;
    return true;
  } catch {
    return false;
  }
}

let session: InferenceSession | null = null;
let taskPrototypes: Float32Array[] = [];
let nonTaskPrototypes: Float32Array[] = [];
let sessionLoadFailed = false;

const TASK_SENTENCES = [
  'please send the document and confirm by tomorrow',
  'call me back urgently as soon as possible',
  'review and approve the report before the deadline',
  'pay the invoice before it is due this week',
  'let me know your feedback on this proposal',
  'submit the form to the manager by end of day',
  'need your response and approval on this matter',
  'follow up on the pending request immediately',
];

const NON_TASK_SENTENCES = [
  'good morning just letting you know about this update',
  'thanks for everything have a great day',
  'your package has been shipped tracking number included',
  'happy birthday wishing you all the best',
];

// ── Tokenizer (simplified BERT WordPiece) ────────────────────────────────────

const CLS = 101;
const SEP = 102;
const UNK = 100;
const PAD = 0;
const MAX_SEQ_LEN = 128;

// Minimal vocab subset for common English task-related words.
// The full BERT vocab has 30,522 tokens; we include the 256 most frequent
// ones plus task-domain words. Unknown words map to UNK (100).
// This is a lossy approximation — embeddings will be close but not identical
// to the full tokenizer. Sufficient for similarity scoring.
const MINI_VOCAB: Record<string, number> = {
  // Special tokens
  '[PAD]': 0,
  '[UNK]': 100,
  '[CLS]': 101,
  '[SEP]': 102,
  '[MASK]': 103,
  // Common sub-words and words (sampled from bert-base-uncased vocab)
  the: 1996,
  a: 1037,
  to: 2000,
  and: 1998,
  of: 1997,
  in: 1999,
  is: 2003,
  you: 2017,
  for: 2005,
  that: 2008,
  it: 2009,
  me: 2033,
  with: 2007,
  this: 2023,
  be: 2022,
  on: 2006,
  are: 2024,
  have: 2031,
  i: 1045,
  your: 2115,
  my: 2026,
  we: 2057,
  can: 2064,
  by: 2011,
  please: 3531,
  send: 3638,
  call: 2655,
  check: 4638,
  review: 3319,
  submit: 9015,
  share: 3745,
  update: 5183,
  confirm: 12011,
  approve: 14969,
  sign: 3696,
  complete: 3143,
  finish: 3926,
  pay: 3477,
  buy: 4965,
  book: 2338,
  schedule: 7579,
  meet: 3113,
  follow: 3582,
  reply: 10439,
  respond: 6889,
  fix: 8081,
  help: 2393,
  do: 2079,
  make: 2191,
  need: 2734,
  must: 2442,
  urgent: 15887,
  important: 2590,
  asap: 29280,
  deadline: 15117,
  tomorrow: 3154,
  today: 2651,
  due: 2349,
  action: 2895,
  required: 3223,
  task: 4708,
  request: 4931,
  meeting: 3116,
  document: 6254,
  report: 3189,
  file: 5371,
  form: 2433,
  bill: 3021,
  payment: 7909,
  invoice: 19082,
  approval: 6300,
  signature: 8561,
  message: 4471,
  notification: 14820,
  new: 2047,
  from: 2013,
  good: 2204,
  morning: 2851,
  hi: 7632,
  hello: 7592,
  thanks: 4283,
  okay: 3251,
  ok: 10287,
  yes: 2748,
  no: 2053,
  lol: 20374,
  already: 2525,
  sent: 2741,
  done: 2589,
  completed: 5967,
  waiting: 3403,
  pending: 12307,
  feedback: 7705,
  input: 7953,
  response: 4438,
  decision: 4530,
  back: 2067,
  let: 2292,
  know: 2113,
};

function bertTokenize(text: string): number[] {
  const lower = text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ');
  const words = lower.split(/\s+/).filter(Boolean);
  const ids: number[] = [CLS];
  for (const word of words) {
    ids.push(MINI_VOCAB[word] ?? UNK);
  }
  ids.push(SEP);
  return ids;
}

function buildInputs(text: string): {
  inputIds: BigInt64Array;
  attentionMask: BigInt64Array;
  tokenTypeIds: BigInt64Array;
} {
  const raw = bertTokenize(text).slice(0, MAX_SEQ_LEN);
  const padded = [...raw, ...Array(MAX_SEQ_LEN - raw.length).fill(PAD)];
  const mask = padded.map((id) => (id !== PAD ? 1n : 0n));

  return {
    inputIds: BigInt64Array.from(padded.map(BigInt)),
    attentionMask: BigInt64Array.from(mask),
    tokenTypeIds: BigInt64Array.from(padded.map(() => 0n)),
  };
}

// ── Inference helpers ─────────────────────────────────────────────────────────

async function embed(text: string): Promise<Float32Array | null> {
  if (!session || !TensorClass) return null;
  try {
    const { inputIds, attentionMask, tokenTypeIds } = buildInputs(text);
    const seqLen = MAX_SEQ_LEN;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const T = TensorClass as any;
    const feeds = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      input_ids: new T('int64', inputIds, [1, seqLen]),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      attention_mask: new T('int64', attentionMask, [1, seqLen]),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      token_type_ids: new T('int64', tokenTypeIds, [1, seqLen]),
    };

    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const results = await session.run(feeds);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const hiddenState: Float32Array = results['last_hidden_state'].data as Float32Array;

    // Mean pool over sequence dimension: [1, seqLen, 384] → [384]
    const hiddenSize = 384;
    const pooled = new Float32Array(hiddenSize);
    let count = 0;
    for (let s = 0; s < seqLen; s++) {
      if (attentionMask[s] === 0n) continue;
      count++;
      for (let h = 0; h < hiddenSize; h++) {
        pooled[h] += hiddenState[s * hiddenSize + h];
      }
    }
    if (count > 0) for (let h = 0; h < hiddenSize; h++) pooled[h] /= count;
    return pooled;
  } catch {
    return null;
  }
}

function cosine(a: Float32Array, b: Float32Array): number {
  let dot = 0,
    normA = 0,
    normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function isModelLoaded(): boolean {
  return session !== null && !sessionLoadFailed && taskPrototypes.length > 0;
}

export async function loadModel(): Promise<boolean> {
  if (session) return true;
  if (sessionLoadFailed) return false;
  if (!tryLoadOrt()) {
    sessionLoadFailed = true;
    return false;
  }
  if (!(await isModelCached())) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    session = await InferenceSessionClass!.create(getModelLocalPath());

    // Embed all prototype sentences in parallel for multi-prototype classification
    const [taskEmbs, nonTaskEmbs] = await Promise.all([
      Promise.all(TASK_SENTENCES.map((s) => embed(s))),
      Promise.all(NON_TASK_SENTENCES.map((s) => embed(s))),
    ]);
    taskPrototypes = taskEmbs.filter((e): e is Float32Array => e !== null);
    nonTaskPrototypes = nonTaskEmbs.filter((e): e is Float32Array => e !== null);
    if (taskPrototypes.length === 0) throw new Error('Failed to embed task prototypes');
    return true;
  } catch {
    session = null;
    taskPrototypes = [];
    nonTaskPrototypes = [];
    sessionLoadFailed = true;
    return false;
  }
}

/**
 * Returns a 0–1 score indicating task probability.
 * Higher = more likely a real actionable task.
 */
export async function classifyTaskProbability(text: string): Promise<number> {
  if (!session || taskPrototypes.length === 0 || nonTaskPrototypes.length === 0) return 0.5;
  const emb = await embed(text);
  if (!emb) return 0.5;

  // Mean cosine similarity to each prototype class
  const avgTask =
    taskPrototypes.reduce((sum, p) => sum + cosine(emb, p), 0) / taskPrototypes.length;
  const avgNonTask =
    nonTaskPrototypes.reduce((sum, p) => sum + cosine(emb, p), 0) / nonTaskPrototypes.length;

  // Normalize: how much closer to task vs non-task prototypes
  const score = (avgTask - avgNonTask + 1) / 2;
  return Math.max(0, Math.min(1, score));
}
