// In-memory hand-off for call transcripts delivered via the ACTION_SEND share
// intent (see _layout.tsx's share-intent interception and
// settings/call-transcription.tsx for the Termux script that sends them).
// Transcript text can be several KB — too large for router params — so it is
// stashed here and consumed once by the call-transcript screen.

export interface CallTranscriptPayload {
  text: string;
  callTime: number; // epoch ms when the call took place
  callerLabel: string;
}

let stashed: CallTranscriptPayload | null = null;

export function stashCallTranscript(payload: CallTranscriptPayload): void {
  stashed = payload;
}

export function consumeCallTranscript(): CallTranscriptPayload | null {
  const payload = stashed;
  stashed = null;
  return payload;
}
