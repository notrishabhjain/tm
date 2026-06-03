import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import { getSetting, setSetting } from '@/data/storage/settings';

const TASKS_API = 'https://tasks.googleapis.com/tasks/v1';
const OAUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REDIRECT_URI = 'taskmind://oauth/google';
const SCOPE = 'https://www.googleapis.com/auth/tasks';

export interface GoogleTaskInput {
  title: string;
  notes?: string;
  dueDate?: number | null; // timestamp ms
}

// PKCE helpers
async function generateCodeVerifier(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(32);
  return Buffer.from(bytes).toString('base64url');
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const digest = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier, {
    encoding: Crypto.CryptoEncoding.BASE64,
  });
  // Convert base64 to base64url
  return digest.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

export async function startOAuthFlow(clientId: string): Promise<void> {
  const codeVerifier = await generateCodeVerifier();
  const codeChallenge = await generateCodeChallenge(codeVerifier);
  const state = await generateCodeVerifier(); // reuse for CSRF state

  setSetting('google_tasks_code_verifier', codeVerifier);
  setSetting('google_tasks_oauth_state', state);
  setSetting('google_tasks_client_id', clientId);

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    state,
    access_type: 'offline',
    prompt: 'consent',
  });

  const url = `${OAUTH_URL}?${params.toString()}`;
  await WebBrowser.openBrowserAsync(url);
}

export async function handleOAuthCallback(callbackUrl: string): Promise<boolean> {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const savedState = getSetting('google_tasks_oauth_state');
  const codeVerifier = getSetting('google_tasks_code_verifier');
  const clientId = getSetting('google_tasks_client_id');

  if (!code || !state || state !== savedState || !codeVerifier || !clientId) return false;

  try {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier,
      }).toString(),
    });
    if (!resp.ok) return false;
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
  } catch {
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
  if (!refreshToken || !clientId) return null;

  try {
    const resp = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        refresh_token: refreshToken,
        client_id: clientId,
        grant_type: 'refresh_token',
      }).toString(),
    });
    if (!resp.ok) return null;
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
    if (task.dueDate) {
      const d = new Date(task.dueDate);
      d.setUTCHours(0, 0, 0, 0);
      body['due'] = d.toISOString();
    }
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
}
