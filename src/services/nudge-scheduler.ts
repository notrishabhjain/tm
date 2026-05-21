import notifee, { AndroidImportance, TriggerType, TimeUnit } from '@notifee/react-native';
import type { IntervalTrigger } from '@notifee/react-native';

const CHANNEL_ID = 'taskmind_nudges';
const NUDGE_ID = 'taskmind_nudge_reminder';

export async function scheduleNudge(frequencyMinutes: number): Promise<void> {
  // Always cancel existing nudge first
  try {
    await notifee.cancelTriggerNotification(NUDGE_ID);
  } catch {
    // May not exist yet
  }

  if (frequencyMinutes <= 0) return;

  await notifee.createChannel({
    id: CHANNEL_ID,
    name: 'Task Reminders',
    importance: AndroidImportance.DEFAULT,
    description: 'Periodic reminders to review pending tasks',
    sound: 'default',
    vibration: true,
  });

  const trigger: IntervalTrigger = {
    type: TriggerType.INTERVAL,
    interval: frequencyMinutes,
    timeUnit: TimeUnit.MINUTES,
  };

  await notifee.createTriggerNotification(
    {
      id: NUDGE_ID,
      title: 'TaskMind',
      body: 'You have pending tasks waiting for your attention.',
      android: {
        channelId: CHANNEL_ID,
        pressAction: { id: 'default', launchActivity: 'default' },
        color: '#0A2540',
      },
    },
    trigger
  );
}

export async function cancelNudge(): Promise<void> {
  try {
    await notifee.cancelTriggerNotification(NUDGE_ID);
  } catch {
    // Already cancelled or never scheduled
  }
}

export async function restoreNudgeFromSettings(frequencyMinutes: number): Promise<void> {
  // Called on app start to re-arm any nudge that was cleared by OS
  if (frequencyMinutes <= 0) return;
  const scheduled = await notifee.getTriggerNotificationIds();
  if (!scheduled.includes(NUDGE_ID)) {
    await scheduleNudge(frequencyMinutes);
  }
}
