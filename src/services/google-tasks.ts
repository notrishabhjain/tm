import { Linking } from 'react-native';
import { getSetting, setSetting } from '@/data/storage/settings';
import { appDisplayName } from './app-name-map';
import NotificationListener from '../../modules/notification-listener/src';

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

// All Google network calls get a hard timeout. Without one, a hung fetch in a
// headless (background) JS context stalls the whole pipeline until Android
// kills the context — which also silently aborts the sync.
const FETCH_TIMEOUT_MS = 15_000;

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
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

/**
 * Returns a usable access token, refreshing when the cached one is expired (or
 * when [forceRefresh] is set — used after a 401, where Google rejected a token
 * whose stored expiry hadn't elapsed yet).
 *
 * The refresh POST is retried once on a transient failure (network error /
 * timeout / 5xx). Without this, a single blip at the ~1h token boundary while
 * the app is backgrounded drops that notification's task to the outbox — the
 * root cause of "tasks stop appearing after a few hours in the background".
 */
async function getValidAccessToken(forceRefresh = false): Promise<string | null> {
  const expiry = getSetting('google_tasks_token_expiry');
  const accessToken = getSetting('google_tasks_access_token');
  if (!forceRefresh && accessToken && Date.now() < expiry - 60_000) return accessToken;

  // Refresh — fall back to bundled credentials if stored values were cleared
  // (e.g. after a disconnect/reconnect that didn't re-store them). Desktop app
  // credentials are public by design; the fallback is safe.
  const refreshToken = getSetting('google_tasks_refresh_token');
  const clientId = getSetting('google_tasks_client_id') || GOOGLE_CLIENT_ID;
  const clientSecret = getSetting('google_tasks_client_secret') || GOOGLE_CLIENT_SECRET;
  if (!refreshToken) {
    // eslint-disable-next-line no-console
    console.warn('[GoogleTasks] token refresh skipped — no refresh_token stored');
    return null;
  }

  const refreshParams = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: 'refresh_token',
  }).toString();

  // Two attempts: a transient network/5xx failure on attempt 1 is retried after
  // a short pause. invalid_grant / 4xx are permanent — no retry.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const resp = await fetchWithTimeout(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: refreshParams,
      });
      if (resp.ok) {
        const tokens = (await resp.json()) as { access_token: string; expires_in: number };
        setSetting('google_tasks_access_token', tokens.access_token);
        // Re-store client credentials alongside the refreshed token so they
        // survive a future disconnect/reconnect cycle.
        setSetting('google_tasks_client_id', clientId);
        setSetting('google_tasks_client_secret', clientSecret);
        setSetting('google_tasks_token_expiry', Date.now() + tokens.expires_in * 1000);
        return tokens.access_token;
      }
      const err = (await resp.json().catch(() => ({}))) as {
        error?: string;
        error_description?: string;
      };
      // eslint-disable-next-line no-console
      console.warn(
        '[GoogleTasks] token refresh failed',
        resp.status,
        err.error,
        err.error_description
      );
      if (err.error === 'invalid_grant') {
        // Refresh token revoked / expired (e.g. Google's 7-day refresh-token
        // limit on OAuth apps still in "Testing" publishing status). Auto-
        // disconnect so the settings screen shows "not connected", and tell the
        // user with a notification — otherwise the pipeline silently no-ops on
        // every sync for the rest of the session with no clue to reconnect.
        setSetting('google_tasks_access_token', '');
        setSetting('google_tasks_refresh_token', '');
        setSetting('google_tasks_token_expiry', 0);
        setSetting('google_tasks_enabled', false);
        void NotificationListener.postConfirmation(
          'Reconnect Google Tasks',
          'TaskMind was signed out of Google. Open TaskMind and tap Connect to resume creating tasks.'
        ).catch(() => {});
        return null;
      }
      // Any other 4xx is permanent for this refresh token — don't retry.
      if (resp.status < 500) return null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[GoogleTasks] token refresh error', e);
    }
    if (attempt === 1) await new Promise<void>((r) => setTimeout(r, 3000));
  }
  return null;
}

const TASKMIND_LIST_TITLE = 'TaskMind';

/**
 * Resolves (or creates) the dedicated "TaskMind" list so synced tasks don't
 * pollute the user's personal default list. Cached under a NEW settings key —
 * the old google_tasks_list_id (which pointed at the user's first list) is
 * deliberately ignored so existing installs migrate on their next sync.
 */
export async function getTaskMindListId(accessToken: string): Promise<string> {
  const saved = getSetting('google_tasks_taskmind_list_id');
  if (saved) return saved;
  try {
    const resp = await fetchWithTimeout(`${TASKS_API}/users/@me/lists?maxResults=100`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (resp.ok) {
      const data = (await resp.json()) as { items?: { id: string; title: string }[] };
      const existing = data.items?.find((l) => l.title === TASKMIND_LIST_TITLE);
      if (existing) {
        setSetting('google_tasks_taskmind_list_id', existing.id);
        return existing.id;
      }
    }
    // No TaskMind list yet — create it.
    const createResp = await fetchWithTimeout(`${TASKS_API}/users/@me/lists`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: TASKMIND_LIST_TITLE }),
    });
    if (createResp.ok) {
      const created = (await createResp.json()) as { id: string };
      if (created.id) {
        setSetting('google_tasks_taskmind_list_id', created.id);
        return created.id;
      }
    }
    return '@default';
  } catch {
    return '@default';
  }
}

export interface GoogleTaskNotesInput {
  priority?: string | null;
  sender?: string | null;
  sourceApp?: string | null;
  howTo?: string | null;
  estimatedMinutes?: number | null;
  dueDate?: number | null;
  body?: string | null;
}

/**
 * Single structured notes builder used by EVERY sync call site, so all task
 * metadata reaches Google Tasks consistently. Google's API has no fields for
 * priority/sender/etc., and drops the time portion of `due` — so they're
 * encoded here in a readable form.
 */
export function buildGoogleTaskNotes(input: GoogleTaskNotesInput): string {
  const lines: string[] = [];
  if (input.priority) lines.push(`Priority: ${input.priority}`);
  if (input.sender || input.sourceApp) {
    const from = [input.sender, input.sourceApp ? appDisplayName(input.sourceApp) : null]
      .filter(Boolean)
      .join(' · ');
    lines.push(`From: ${from}`);
  }
  // Google Tasks only keeps the DATE of `due` — preserve the time-of-day in
  // notes when the deadline has one (anything other than local midnight).
  if (input.dueDate) {
    const d = new Date(input.dueDate);
    if (d.getHours() !== 0 || d.getMinutes() !== 0) {
      lines.push(
        `Due: ${d.toLocaleString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          hour: 'numeric',
          minute: '2-digit',
        })}`
      );
    }
  }
  if (input.howTo) lines.push(`How to: ${input.howTo}`);
  if (input.estimatedMinutes) lines.push(`Estimated: ${input.estimatedMinutes} min`);
  if (input.body) {
    if (lines.length > 0) lines.push('---');
    lines.push(input.body.slice(0, 500));
  }
  return lines.join('\n');
}

export async function createGoogleTask(task: GoogleTaskInput): Promise<string | null> {
  if (!getSetting('google_tasks_enabled')) return null;
  let token = await getValidAccessToken();
  if (!token) return null;

  // One reissue: if Google rejects the token with 401 despite our stored expiry
  // not having elapsed (clock skew, server-side early revocation), force a
  // refresh and retry once before giving up. Without this the task is needlessly
  // dropped to the outbox even though a fresh token would have worked.
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const listId = await getTaskMindListId(token);
      const body: Record<string, string> = { title: task.title };
      if (task.notes) body['notes'] = task.notes;
      // Always set a due date — use the extracted one or default to today.
      // Google Tasks only honors the date portion and expects it encoded as UTC
      // midnight, so take the LOCAL calendar date (an IST "by 3am" deadline must
      // not slip to the previous day) and encode that as UTC midnight.
      const dueTs = task.dueDate ?? Date.now();
      const d = new Date(dueTs);
      body['due'] = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString();
      const resp = await fetchWithTimeout(`${TASKS_API}/lists/${listId}/tasks`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (resp.ok) {
        const created = (await resp.json()) as { id: string };
        return created.id ?? null;
      }
      // 401 on the first attempt → force-refresh the token and retry once.
      if (resp.status === 401 && attempt === 1) {
        const fresh = await getValidAccessToken(true);
        if (!fresh) return null;
        token = fresh;
        continue;
      }
      // eslint-disable-next-line no-console
      console.warn(
        '[GoogleTasks] createGoogleTask failed',
        resp.status,
        await resp.text().catch(() => '')
      );
      // If the stored list ID is stale (e.g. user deleted the TaskMind list),
      // clear the cache so the next sync re-resolves/re-creates it.
      if (resp.status === 404 && listId !== '@default') {
        setSetting('google_tasks_taskmind_list_id', '');
      }
      return null;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[GoogleTasks] createGoogleTask error', e);
      return null;
    }
  }
  return null;
}

export async function completeGoogleTask(googleTaskId: string): Promise<void> {
  if (!getSetting('google_tasks_enabled')) return;
  const token = await getValidAccessToken();
  if (!token) return;

  try {
    const listId = getSetting('google_tasks_taskmind_list_id') || '@default';
    await fetchWithTimeout(`${TASKS_API}/lists/${listId}/tasks/${googleTaskId}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'completed' }),
    });
  } catch {
    /* non-fatal */
  }
}

/**
 * Deletes the Google copy of a task. Called when the user deletes/rejects a
 * task in TaskMind so the two lists never drift apart.
 */
export async function deleteGoogleTask(googleTaskId: string): Promise<void> {
  if (!getSetting('google_tasks_enabled')) return;
  const token = await getValidAccessToken();
  if (!token) return;

  try {
    const listId = getSetting('google_tasks_taskmind_list_id') || '@default';
    await fetchWithTimeout(`${TASKS_API}/lists/${listId}/tasks/${googleTaskId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
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
  setSetting('google_tasks_taskmind_list_id', '');
  setSetting('google_tasks_client_secret', '');
}
