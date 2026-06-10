// In-memory hand-off for regular ACTION_SEND shares (see _layout.tsx).
// The intent is cleared natively BEFORE navigation so a foreground cycle can't
// re-trigger the share screen; the payload lives here until the screen reads it.

export interface SharePayload {
  text: string;
  subject: string | null;
}

let stashed: SharePayload | null = null;

export function stashShare(payload: SharePayload): void {
  stashed = payload;
}

export function consumeShare(): SharePayload | null {
  const payload = stashed;
  stashed = null;
  return payload;
}
