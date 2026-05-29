import notifee, { AndroidImportance } from '@notifee/react-native';
import { db, initializeDatabase } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { getSetting, setSetting } from '@/data/storage/settings';

const NVIDIA_BASE_URL = 'https://integrate.api.nvidia.com/v1';
const CHANNEL_ID = 'taskmind_digest';
const NOTIF_ID = 'taskmind_ai_digest';
const TIMEOUT_MS = 15_000;

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isPastDigestTime(): boolean {
  try {
    const [h, m] = getSetting('ai_digest_time').split(':').map(Number);
    const now = new Date();
    return now.getHours() * 60 + now.getMinutes() >= h * 60 + m;
  } catch {
    return false;
  }
}

async function fetchDigestText(
  tasks: { title: string; priority: string }[]
): Promise<string | null> {
  const apiKey = getSetting('ai_api_key');
  const model = getSetting('ai_model');
  if (!apiKey || tasks.length === 0) return null;

  const taskList = tasks
    .slice(0, 20)
    .map((t, i) => `${i + 1}. [${t.priority}] ${t.title}`)
    .join('\n');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const resp = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content:
              'You are a personal assistant helping the user start their day. Given a list of pending tasks, write a 2-3 sentence briefing: what to focus on first and why. Be direct and specific. No fluff.',
          },
          {
            role: 'user',
            content: `My pending tasks:\n${taskList}\n\nWhat should I focus on today?`,
          },
        ],
        max_tokens: 120,
        temperature: 0.3,
      }),
    });

    if (!resp.ok) return null;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const data = (await resp.json()) as any;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return (data?.choices?.[0]?.message?.content as string) ?? null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function runDigest(): Promise<{ sent: boolean; error?: string }> {
  try {
    initializeDatabase();
    const taskRepo = new TaskRepository(db);
    const pending = await taskRepo.getPendingTasks();
    if (pending.length === 0) return { sent: false, error: 'No pending tasks' };

    const tasks = pending.map((t) => ({ title: t.title, priority: t.priority }));
    const briefing = await fetchDigestText(tasks);
    if (!briefing) return { sent: false, error: 'No response from AI (check API key)' };

    await notifee.createChannel({
      id: CHANNEL_ID,
      name: 'AI Daily Digest',
      importance: AndroidImportance.HIGH,
      description: 'Daily AI-generated task briefing',
      sound: 'default',
    });

    await notifee.displayNotification({
      id: NOTIF_ID,
      title: `TaskMind · ${pending.length} tasks pending`,
      body: briefing,
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: 'default', launchActivity: 'default' },
        color: '#0A2540',
      },
    });

    setSetting('ai_last_digest_date', todayKey());
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export async function runDailyDigestIfNeeded(): Promise<void> {
  if (!getSetting('ai_enabled')) return;
  if (!getSetting('ai_digest_enabled')) return;
  if (!isPastDigestTime()) return;
  if (getSetting('ai_last_digest_date') === todayKey()) return;
  await runDigest();
}

export async function runDailyDigestNow(): Promise<{ sent: boolean; error?: string }> {
  if (!getSetting('ai_enabled')) return { sent: false, error: 'Cloud AI is disabled' };
  if (!getSetting('ai_api_key')) return { sent: false, error: 'No API key configured' };
  setSetting('ai_last_digest_date', ''); // clear so it can run again today if needed
  return runDigest();
}
