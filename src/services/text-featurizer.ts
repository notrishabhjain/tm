export const FEATURE_DIM = 8192;

function murmur3(str: string): number {
  let h1 = 0xdeadbeef;
  const c1 = 0xcc9e2d51;
  const c2 = 0x1b873593;
  for (let i = 0; i < str.length; i++) {
    let k1 = str.charCodeAt(i) & 0xffff;
    k1 = Math.imul(k1, c1) >>> 0;
    k1 = ((k1 << 15) | (k1 >>> 17)) >>> 0;
    k1 = Math.imul(k1, c2) >>> 0;
    h1 = (h1 ^ k1) >>> 0;
    h1 = ((h1 << 13) | (h1 >>> 19)) >>> 0;
    h1 = ((Math.imul(h1, 5) >>> 0) + 0xe6546b64) >>> 0;
  }
  h1 = (h1 ^ str.length) >>> 0;
  h1 ^= h1 >>> 16;
  h1 = Math.imul(h1, 0x85ebca6b) >>> 0;
  h1 ^= h1 >>> 13;
  h1 = Math.imul(h1, 0xc2b2ae35) >>> 0;
  h1 ^= h1 >>> 16;
  return h1 % FEATURE_DIM;
}

// Tokenize into lowercase word tokens, including Devanagari.
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\w\sऀ-ॿ]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && t.length <= 24);
}

// Returns a L2-normalized unigram+bigram bag-of-words feature vector.
export function featurize(text: string): Float32Array {
  const feat = new Float32Array(FEATURE_DIM);
  const tokens = tokenize(text);

  for (const tok of tokens) {
    feat[murmur3(tok)] += 1;
  }
  for (let i = 0; i < tokens.length - 1; i++) {
    feat[murmur3(`${tokens[i]}__${tokens[i + 1]}`)] += 1;
  }

  let norm = 0;
  for (let i = 0; i < FEATURE_DIM; i++) norm += feat[i] * feat[i];
  norm = Math.sqrt(norm);
  if (norm > 0) for (let i = 0; i < FEATURE_DIM; i++) feat[i] /= norm;

  return feat;
}
