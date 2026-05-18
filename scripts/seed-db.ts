import { db, initializeDatabase } from '../src/data/db/client';
import { seedKeywords, monitoredApps } from '../src/data/db/schema';
import seedKeywordsRaw from '../assets/seed-keywords.json';

type RawKeyword = { keyword: string; language: string; priority_hint: string };

const DEFAULT_MONITORED_APPS = [
  { packageName: 'com.whatsapp', displayName: 'WhatsApp' },
  { packageName: 'com.whatsapp.w4b', displayName: 'WhatsApp Business' },
  { packageName: 'com.google.android.gm', displayName: 'Gmail' },
  { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams' },
  { packageName: 'com.slack', displayName: 'Slack' },
  { packageName: 'org.telegram.messenger', displayName: 'Telegram' },
];

async function main(): Promise<void> {
  await initializeDatabase();
  const now = Date.now();
  const keywords = seedKeywordsRaw as RawKeyword[];

  await db.delete(seedKeywords);
  for (const kw of keywords) {
    await db.insert(seedKeywords).values({
      keyword: kw.keyword,
      language: kw.language,
      priorityHint: kw.priority_hint,
      category: 'IMPERATIVE',
      weight: kw.priority_hint === 'URGENT' ? 1.5 : kw.priority_hint === 'HIGH' ? 1.2 : 1.0,
      createdAt: now,
    });
  }
  console.log(`Seeded ${keywords.length} keywords.`);

  await db.delete(monitoredApps);
  for (const app of DEFAULT_MONITORED_APPS) {
    await db.insert(monitoredApps).values({
      packageName: app.packageName,
      displayName: app.displayName,
      isActive: true,
      createdAt: now,
    });
  }
  console.log(`Seeded ${DEFAULT_MONITORED_APPS.length} monitored apps.`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
