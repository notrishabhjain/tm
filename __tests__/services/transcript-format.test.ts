import {
  parseSpeakerTranscript,
  parseTimestamp,
  looksLikeTranscript,
} from '../../src/services/transcript-format';

// The exact shape Xiaomi's Recorder produces, as captured from a real call.
const XIAOMI_SAMPLE = `Speaker 1 00:00:00
हाँ जी।
Speaker 2 00:00:03
दिल्ली रोड पे हूँ मंडी पे ठीक।`;

describe('parseTimestamp', () => {
  it('parses h:mm:ss and mm:ss', () => {
    expect(parseTimestamp('00:00:03')).toBe(3);
    expect(parseTimestamp('01:02:03')).toBe(3723);
    expect(parseTimestamp('02:30')).toBe(150);
  });

  it('tolerates fractional seconds', () => {
    expect(parseTimestamp('00:00:03.500')).toBe(3);
    expect(parseTimestamp('00:00:03,500')).toBe(3);
  });

  it('rejects nonsense', () => {
    expect(parseTimestamp(undefined)).toBeNull();
    expect(parseTimestamp('later')).toBeNull();
    expect(parseTimestamp('12')).toBeNull();
  });
});

describe('parseSpeakerTranscript — Xiaomi Recorder format', () => {
  it('extracts speaker turns and drops the timestamps', () => {
    const parsed = parseSpeakerTranscript(XIAOMI_SAMPLE);
    expect(parsed.diarised).toBe(true);
    expect(parsed.speakerCount).toBe(2);
    expect(parsed.turns).toHaveLength(2);
    expect(parsed.turns[0]).toMatchObject({ speaker: 1, atSec: 0, text: 'हाँ जी।' });
    expect(parsed.turns[1]).toMatchObject({
      speaker: 2,
      atSec: 3,
      text: 'दिल्ली रोड पे हूँ मंडी पे ठीक।',
    });
  });

  it('keeps speaker attribution in the flattened text', () => {
    const parsed = parseSpeakerTranscript(XIAOMI_SAMPLE);
    expect(parsed.text).toBe('Speaker 1: हाँ जी।\nSpeaker 2: दिल्ली रोड पे हूँ मंडी पे ठीक।');
    // Timestamps must not survive — they burn context and mean nothing to the extractor.
    expect(parsed.text).not.toMatch(/00:00/);
  });

  it('handles speech on the same line as the speaker header', () => {
    const parsed = parseSpeakerTranscript(
      'Speaker 1 00:00:00 haan ji\nSpeaker 2 00:00:03 theek hai'
    );
    expect(parsed.turns.map((t) => t.text)).toEqual(['haan ji', 'theek hai']);
  });

  it('merges consecutive turns from the same speaker', () => {
    const parsed = parseSpeakerTranscript(
      'Speaker 1 00:00:00\nfirst part\nSpeaker 1 00:00:04\nsecond part\nSpeaker 2 00:00:09\nreply'
    );
    expect(parsed.turns).toHaveLength(2);
    expect(parsed.turns[0]?.text).toBe('first part second part');
  });

  it('joins a turn that wraps across several lines', () => {
    const parsed = parseSpeakerTranscript('Speaker 1 00:00:00\nline one\nline two\nline three');
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.turns[0]?.text).toBe('line one line two line three');
  });
});

describe('parseSpeakerTranscript — other shapes', () => {
  it('returns plain text unchanged as a single turn', () => {
    const parsed = parseSpeakerTranscript('just some spoken words with no markup at all');
    expect(parsed.diarised).toBe(false);
    expect(parsed.turns).toHaveLength(1);
    expect(parsed.text).toBe('just some spoken words with no markup at all');
  });

  it('does not mistake a spoken time for a timing line', () => {
    // "5:30 baje milte hain" is speech, not markup — mangling it would lose the
    // most task-relevant sentence in the call.
    const parsed = parseSpeakerTranscript('Speaker 1 00:00:00\n5:30 baje milte hain');
    expect(parsed.turns[0]?.text).toBe('5:30 baje milte hain');
  });

  it('strips bare timestamp lines from undiarised transcripts', () => {
    const parsed = parseSpeakerTranscript('00:00:00\nhello there\n00:00:05\ngoodbye now');
    expect(parsed.turns.map((t) => t.text)).toEqual(['hello there', 'goodbye now']);
  });

  it('survives empty and whitespace-only input', () => {
    expect(parseSpeakerTranscript('').turns).toHaveLength(0);
    expect(parseSpeakerTranscript('   \n\n  ').turns).toHaveLength(0);
  });
});

describe('looksLikeTranscript', () => {
  it('accepts a diarised transcript', () => {
    expect(looksLikeTranscript(XIAOMI_SAMPLE)).toBe(true);
  });

  it('accepts a long undiarised transcript', () => {
    expect(
      looksLikeTranscript('this is a reasonably long stretch of spoken words shared into the app')
    ).toBe(true);
  });

  it('rejects a bare URL or a short share', () => {
    expect(looksLikeTranscript('https://example.com/some/long/path/that/is/quite/long')).toBe(
      false
    );
    expect(looksLikeTranscript('ok')).toBe(false);
    expect(looksLikeTranscript('')).toBe(false);
  });
});
