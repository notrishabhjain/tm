import { db, initializeDatabase } from '@/data/db/client';
import { seedKeywords, monitoredApps } from '@/data/db/schema';
import { getSetting, setSetting } from '@/data/storage/settings';
import seedKeywordsRaw from '../../assets/seed-keywords.json';

type RawKeyword = { keyword: string; language: string; priority_hint: string };

const DEFAULT_MONITORED_APPS = [
  { packageName: 'com.whatsapp', displayName: 'WhatsApp' },
  { packageName: 'com.whatsapp.w4b', displayName: 'WhatsApp Business' },
  { packageName: 'com.google.android.gm', displayName: 'Gmail' },
  { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams' },
  { packageName: 'com.slack', displayName: 'Slack' },
  { packageName: 'org.telegram.messenger', displayName: 'Telegram' },
];

export async function seedDatabaseIfNeeded(): Promise<void> {
  if (getSetting('db_seeded')) return;

  initializeDatabase();
  const now = Date.now();
  const keywords = seedKeywordsRaw as RawKeyword[];

  for (const kw of keywords) {
    await db
      .insert(seedKeywords)
      .values({
        keyword: kw.keyword,
        language: kw.language,
        priorityHint: kw.priority_hint,
        category: 'IMPERATIVE',
        weight: kw.priority_hint === 'URGENT' ? 1.5 : kw.priority_hint === 'HIGH' ? 1.2 : 1.0,
        createdAt: now,
      })
      .onConflictDoNothing();
  }

  for (const app of DEFAULT_MONITORED_APPS) {
    await db.insert(monitoredApps).values({
      packageName: app.packageName,
      displayName: app.displayName,
      isActive: true,
      createdAt: now,
    });
  }

  setSetting('db_seeded', true);
}
