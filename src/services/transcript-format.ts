/**
 * Parsing for transcripts produced by the phone's recorder app.
 *
 * Xiaomi's Recorder emits a speaker-diarised, timestamped transcript:
 *
 *     Speaker 1 00:00:00
 *     हाँ जी।
 *     Speaker 2 00:00:03
 *     दिल्ली रोड पे हूँ मंडी पे ठीक।
 *
 * Two things about this shape matter downstream:
 *
 *  - The timestamps are noise for task extraction and burn context, so they go.
 *  - The speaker labels are NOT noise. "Send me the report by tomorrow" means
 *    something different depending on who said it, and the extractor needs that
 *    to decide whether the user is the one being asked. So turns are preserved
 *    and speaker attribution is kept in the flattened output.
 */

export interface TranscriptTurn {
  /** 1-based speaker number as labelled by the recorder, or null if unlabelled. */
  speaker: number | null;
  /** Offset into the recording in seconds, or null when not given. */
  atSec: number | null;
  text: string;
}

export interface ParsedTranscript {
  turns: TranscriptTurn[];
  /** Speaker-attributed text, ready to hand to the extractor. */
  text: string;
  /** How many distinct speakers the recorder identified. */
  speakerCount: number;
  /** True when the input actually looked like a diarised transcript. */
  diarised: boolean;
}

// "Speaker 1 00:00:03", tolerating the localised label and an optional colon.
// The text may follow on the same line (some builds) or the next one.
const SPEAKER_LINE =
  /^\s*(?:speaker|स्पीकर|वक्ता|talker)\s*[#]?\s*(\d+)\s*[:-]?\s*(?:(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?))?\s*(.*)$/i;

// A bare timestamp on its own line, used by recorders that do not diarise.
const BARE_TIME_LINE = /^\s*[[(]?\s*(\d{1,2}:\d{2}(?::\d{2})?(?:[.,]\d{1,3})?)\s*[\])]?\s*(.*)$/;

/** "01:02:03" or "02:03" → seconds. Returns null for anything unparseable. */
export function parseTimestamp(raw: string | undefined): number | null {
  if (!raw) return null;
  const parts = raw.replace(',', '.').split(':');
  if (parts.length < 2 || parts.length > 3) return null;
  const nums = parts.map((p) => Number(p));
  if (nums.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const seconds =
    parts.length === 3 ? nums[0]! * 3600 + nums[1]! * 60 + nums[2]! : nums[0]! * 60 + nums[1]!;
  return Number.isFinite(seconds) ? Math.floor(seconds) : null;
}

/**
 * Parses a recorder transcript into speaker turns.
 *
 * Falls back gracefully: text that carries no speaker or timing markup comes
 * back as a single turn, so callers can hand any transcript here without
 * checking its shape first.
 */
export function parseSpeakerTranscript(raw: string): ParsedTranscript {
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  const turns: TranscriptTurn[] = [];
  const speakers = new Set<number>();
  let sawMarkup = false;

  let current: TranscriptTurn | null = null;
  const push = (): void => {
    if (current && current.text.trim()) {
      current.text = current.text.trim();
      turns.push(current);
    }
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const speakerMatch = SPEAKER_LINE.exec(trimmed);
    if (speakerMatch) {
      sawMarkup = true;
      push();
      const speaker = Number(speakerMatch[1]);
      speakers.add(speaker);
      current = {
        speaker: Number.isFinite(speaker) ? speaker : null,
        atSec: parseTimestamp(speakerMatch[2]),
        // Some builds put the speech on the same line as the header.
        text: (speakerMatch[3] ?? '').trim(),
      };
      continue;
    }

    const timeMatch = BARE_TIME_LINE.exec(trimmed);
    // Only treat this as a timing line when it is a timestamp and (almost)
    // nothing else — otherwise a sentence that merely opens with a time
    // ("5:30 baje milte hain") would be mistaken for markup and mangled.
    if (timeMatch && (timeMatch[2] ?? '').trim().length === 0) {
      sawMarkup = true;
      push();
      current = { speaker: null, atSec: parseTimestamp(timeMatch[1]), text: '' };
      continue;
    }

    if (current) {
      current.text = current.text ? `${current.text} ${trimmed}` : trimmed;
    } else {
      current = { speaker: null, atSec: null, text: trimmed };
    }
  }
  push();

  // Consecutive turns from one speaker are an artefact of how the recorder
  // chunks audio, not a change of turn — merge them so the extractor sees
  // whole utterances rather than fragments.
  const merged: TranscriptTurn[] = [];
  for (const turn of turns) {
    const last = merged[merged.length - 1];
    if (last && last.speaker !== null && last.speaker === turn.speaker) {
      last.text = `${last.text} ${turn.text}`.trim();
    } else {
      merged.push({ ...turn });
    }
  }

  const text = merged
    .map((t) => (t.speaker !== null ? `Speaker ${t.speaker}: ${t.text}` : t.text))
    .join('\n');

  return {
    turns: merged,
    text,
    speakerCount: speakers.size,
    diarised: sawMarkup && speakers.size > 0,
  };
}

/**
 * True when [raw] plausibly is a call transcript rather than something the user
 * shared into the app by accident (a URL, a contact card, a short message).
 * Deliberately permissive — the import screen shows a preview and the user
 * confirms, so this only needs to catch the obviously-wrong.
 */
export function looksLikeTranscript(raw: string): boolean {
  const text = raw.trim();
  if (text.length < 40) return false;
  // A single URL, or a share that is mostly one, is not a transcript.
  if (/^https?:\/\/\S+$/i.test(text)) return false;
  const parsed = parseSpeakerTranscript(text);
  if (parsed.diarised) return true;
  // Undiarised: require enough words that it could carry a commitment.
  return text.split(/\s+/).length >= 12;
}
