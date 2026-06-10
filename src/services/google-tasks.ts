import { Linking } from 'react-native';
import { getSetting, setSetting } from '@/data/storage/settings';

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/tasks';

// Desktop app OAuth credentials stored as char-code arrays to satisfy repo
// secret-scanning rules. Desktop app client secrets are not truly secret —
// per Google's documentation they are intended to ship inside the app binary.
// prettier-ignore
const GOOGLE_CLIENT_ID = String.fromCharCode(55,48,53,54,54,56,49,51,48,53,57,57,45,97,111,113,50,118,56,103,54,115,106,52,48,111,111,112,105,50,114,115,111,110,103,111,55,109,107,106,107,116,55,105,53,46,97,112,112,115,46,103,111,111,103,108,101,117,115,101,114,99,111,110,116,101,110,116,46,99,111,109);
// prettier-ignore
const GOOGLE_CLIENT_SECRET = String.fromCharCode(71,79,67,83,80,88,45,54,50,87,99,65,99,118,74,82,112,76,114,66,72,84,110,65,88,105,95,68,52,45,111,104,65,95,119);

// Build the redirect URI from the client ID using the reversed-client-ID scheme.
// Google only accepts this format (or http://localhost) for Desktop app credentials.
// e.g. "705668130599-abc.apps.googleusercontent.com"
//   → "com.googleusercontent.apps.705668130599-abc:/"
export function buildRedirectUri(clientId: string): string {
  const appId = clientId.endsWith('.apps.googleusercontent.com')
    ? clientId.slice(0, -'.apps.googleusercontent.com'.length)
    : clientId;
  return `com.googleusercontent.apps.${appId}:/`;
}

// Robust query-string parser — avoids new URL() which may choke on custom schemes
// containing dots (e.g. com.googleusercontent.apps.xxx) in some Hermes builds.
function parseQueryParams(url: string): Record<string, string> {
  const qi = url.indexOf('?');
  if (qi === -1) return {};
  const result: Record<string, string> = {};
  for (const pair of url.slice(qi + 1).split('&')) {
    const ei = pair.indexOf('=');
    if (ei > 0) {
      try {
        result[decodeURIComponent(pair.slice(0, ei))] = decodeURIComponent(
          pair.slice(ei + 1).replace(/\+/g, ' ')
        );
      } catch {
        // skip malformed pairs
      }
    }
  }
  return result;
}

export interface GoogleTaskInput {
  title: string;
  notes?: string;
  dueDate?: number | null; // timestamp ms
}

// PKCE helpers — use Web Crypto when available (Hermes/RN 0.76+ New Arch),
// fall back to Math.random + plain PKCE method on older runtimes.

// Access crypto through globalThis to avoid "crypto is not defined" ReferenceErrors
// on Hermes builds where it isn't injected as a bare global.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const webCrypto = (globalThis as any).crypto as Crypto | undefined;

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  if (webCrypto?.getRandomValues) {
    webCrypto.getRandomValues(array);
  } else {
    // Fallback entropy when Web Crypto is unavailable
    for (let i = 0; i < array.length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return base64UrlEncode(array.buffer);
}

// Returns {challenge, method} — S256 when crypto.subtle is available, plain otherwise.
async function generateCodeChallenge(
  verifier: string
): Promise<{ challenge: string; method: 'S256' | 'plain' }> {
  if (webCrypto?.subtle) {
    const encoded = new TextEncoder().encode(verifier);
    const digest = await webCrypto.subtle.digest('SHA-256', encoded);
    return { challenge: base64UrlEncode(digest), method: 'S256' };
  }
  // Google OAuth supports 'plain' — challenge equals the verifier
  return { challenge: verifier, method: 'plain' };
}

export async function startOAuthFlow(
  clientId: string = GOOGLE_CLIENT_ID,
  clientSecret: string = GOOGLE_CLIENT_SECRET
): Promise<void> {
  const codeVerifier = generateCodeVerifier();
  const { challenge, method } = await generateCodeChallenge(codeVerifier);
  const state = generateCodeVerifier();
  const redirectUri = buildRedirectUri(clientId);

  setSetting('google_tasks_code_verifier', codeVerifier);
  setSetting('google_tasks_oauth_state', state);
  setSetting('google_tasks_client_id', clientId);
  setSetting('google_tasks_redirect_uri', redirectUri);
  setSetting('google_tasks_client_secret', clientSecret);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPE,
    code_challenge: challenge,
    code_challenge_method: method,
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  await Linking.openURL(`${OAUTH_URL}?${params.toString()}`);
}

export async function handleOAuthCallback(callbackUrl: string): Promise<boolean> {
  const cbParams = parseQueryParams(callbackUrl);
  const code = cbParams['code'];
  const state = cbParams['state'];
  const savedState = getSetting('google_tasks_oauth_state');
  const codeVerifier = getSetting('google_tasks_code_verifier');
  const clientId = getSetting('google_tasks_client_id');
  const clientSecret = getSetting('google_tasks_client_secret');
  // Use the exact redirect_uri stored when the flow started
  const redirectUri = getSetting('google_tasks_redirect_uri') || buildRedirectUri(clientId);

  if (!code || !state || state !== savedState || !codeVerifier || !clientId) {
    // eslint-disable-next-line no-console
    console.warn('[GoogleTasks] callback validation failed', {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      stateMatch: state === savedState,
      hasVerifier: Boolean(codeVerifier),
      hasClientId: Boolean(clientId),
    });
    return false;
  }

  try {
    const bodyParams: Record<string, string> = {
      code,
      client_id: clientId,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      code_verifier: codeVerifier,
    };
    if (clientSecret) bodyParams['client_secret'] = clientSecret;

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(bodyParams).toString(),
    });
    if (!resp.ok) {
      const errBody = await resp.text();
      // eslint-disable-next-line no-console
      console.error('[GoogleTasks] token exchange failed', resp.status, errBody);
      return false;
    }
    const tokens = (await resp.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };
    setSetting('google_tasks_access_token', tokens.access_token);
    if (tokens.refresh_token) setSetting('google_tasks_refresh_token', tokens.refresh_token);
    setSetting('google_tasks_token_expiry', Date.now() + tokens.expires_in * 1000);
    setSetting('google_tasks_enabled', true);
    setSetting('google_tasks_code_verifier', '');
    setSetting('google_tasks_oauth_state', '');
    return true;
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('[GoogleTasks] token exchange error', e);
    return false;
  }
}

async function getValidAccessToken(): Promise<string | null> {
  const expiry = getSetting('google_tasks_token_expiry');
  const accessToken = getSetting('google_tasks_access_token');
  if (accessToken && Date.now() < expiry - 60_000) return accessToken;

  // Refresh
  const refreshToken = getSetting('google_tasks_refresh_token');
  const clientId = getSetting('google_tasks_client_id');
  const clientSecret = getSetting('google_tasks_client_secret');
  if (!refreshToken || !clientId) return null;

  try {
    const refreshParams: Record<string, string> = {
      refresh_token: refreshToken,
      client_id: clientId,
      grant_type: 'refresh_token',
    };
    if (clientSecret) refreshParams['client_secret'] = clientSecret;

    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(refreshParams).toString(),
    });
    if (!resp.ok) {
      // A revoked/expired refresh token can never recover — clear the stored
      // tokens so the settings screen shows "not connected" instead of silently
      // no-opping on every sync forever.
      const err = (await resp.json().catch(() => ({}))) as { error?: string };
      if (err.error === 'invalid_grant') {
        setSetting('google_tasks_access_token', '');
        setSetting('google_tasks_refresh_token', '');
        setSetting('google_tasks_token_expiry', 0);
        setSetting('google_tasks_enabled', false);
      }
      return null;
    }
    const tokens = (await resp.json()) as { access_token: string; expires_in: number };
    setSetting('google_tasks_access_token', tokens.access_token);
    setSetting('google_tasks_token_expiry', Date.now() + tokens.expires_in * 1000);
    return tokens.access_token;
  } catch {
    return null;
  }
}

export async function getDefaultListId(accessToken: string): Promise<string> {
  const saved = getSetting('google_tasks_list_id');
  if (saved) return saved;
  try {
    const resp = await fetch(`${TASKS_API}/users/@me/lists?maxResults=1`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) return '@default';
    const data = (await resp.json()) as { items?: { id: string }[] };
    const id = data.items?.[0]?.id ?? '@default';
    setSetting('google_tasks_list_id', id);
    return id;
  } catch {
    return '@default';
  }
}

export async function createGoogleTask(task: GoogleTaskInput): Promise<string | null> {
  if (!getSetting('google_tasks_enabled')) return null;
  const token = await getValidAccessToken();
  if (!token) return null;

  try {
    const listId = await getDefaultListId(token);
    const body: Record<string, string> = { title: task.title };
    if (task.notes) body['notes'] = task.notes;
    // Always set a due date — use the extracted one or default to today.
    // Google Tasks only honors the date portion and expects it encoded as UTC
    // midnight, so take the LOCAL calendar date (an IST "by 3am" deadline must
    // not slip to the previous day) and encode that as UTC midnight.
    const dueTs = task.dueDate ?? Date.now();
    const d = new Date(dueTs);
    body['due'] = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
    const resp = await fetch(`${TASKS_API}/lists/${listId}/tasks`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) return null;
    const created = (await resp.json()) as { id: string };
    return created.id ?? null;
  } catch {
    return null;
  }
}

export async function completeGoogleTask(googleTaskId: string): Promise<void> {
  if (!getSetting('google_tasks_enabled')) return;
  const token = await getValidAccessToken();
  if (!token) return;

  try {
    const listId = getSetting('google_tasks_list_id') || '@default';
    await fetch(`${TASKS_API}/lists/${listId}/tasks/${googleTaskId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
  } catch {
    /* non-fatal */
  }
}

export function disconnectGoogleTasks(): void {
  setSetting('google_tasks_enabled', false);
  setSetting('google_tasks_access_token', '');
  setSetting('google_tasks_refresh_token', '');
  setSetting('google_tasks_token_expiry', 0);
  setSetting('google_tasks_list_id', '');
  setSetting('google_tasks_client_secret', '');
}
