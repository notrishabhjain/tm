import { eq } from 'drizzle-orm';
import { db, initializeDatabase } from '@/data/db/client';
import { seedKeywords, monitoredApps, senderStats } from '@/data/db/schema';
import { getSetting, setSetting } from '@/data/storage/settings';
import seedKeywordsRaw from '../../assets/seed-keywords.json';

type RawKeyword = { keyword: string; language: string; priority_hint: string };

const DEFAULT_MONITORED_APPS = [
  { packageName: 'com.whatsapp', displayName: 'WhatsApp' },
  { packageName: 'com.whatsapp.w4b', displayName: 'WhatsApp Business' },
  { packageName: 'com.google.android.gm', displayName: 'Gmail' },
  { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams' },
  { packageName: 'com.Slack', displayName: 'Slack' }, // capital S is Slack's real package name
  { packageName: 'org.telegram.messenger', displayName: 'Telegram' },
];

// Pre-seeded sender trust derived from real task-rate data.
// senderKey format: packageName::snake_lower_sender_name
// seedTrust used until 10+ interactions are recorded.
const SEED_SENDER_STATS = [
  // WhatsApp — derived from 4,064 message corpus
  {
    senderKey: 'com.whatsapp::rohit_gosain_pa',
    tier: 'VIP_WORK',
    seedTrust: 0.9,
    confirmCount: 18,
    rejectCount: 2,
    autoAcceptCount: 5,
  },
  {
    senderKey: 'com.whatsapp::boss',
    tier: 'VIP_WORK',
    seedTrust: 0.85,
    confirmCount: 12,
    rejectCount: 1,
    autoAcceptCount: 8,
  },
  {
    senderKey: 'com.whatsapp::amit_sir',
    tier: 'WORK',
    seedTrust: 0.75,
    confirmCount: 8,
    rejectCount: 3,
    autoAcceptCount: 4,
  },
  {
    senderKey: 'com.whatsapp::shailendra_singh',
    tier: 'INFO',
    seedTrust: 0.25,
    confirmCount: 2,
    rejectCount: 14,
    autoAcceptCount: 1,
  },
  {
    senderKey: 'com.whatsapp::team_taskmind',
    tier: 'WORK',
    seedTrust: 0.65,
    confirmCount: 5,
    rejectCount: 2,
    autoAcceptCount: 3,
  },
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
    const existing = await db
      .select()
      .from(monitoredApps)
      .where(eq(monitoredApps.packageName, app.packageName))
      .limit(1);
    if (existing.length === 0) {
      await db.insert(monitoredApps).values({
        packageName: app.packageName,
        displayName: app.displayName,
        isActive: true,
        createdAt: now,
      });
    }
  }

  for (const s of SEED_SENDER_STATS) {
    await db
      .insert(senderStats)
      .values({
        senderKey: s.senderKey,
        tier: s.tier,
        seedTrust: s.seedTrust,
        confirmCount: s.confirmCount,
        rejectCount: s.rejectCount,
        autoAcceptCount: s.autoAcceptCount,
        lastSeenAt: now,
      })
      .onConflictDoNothing();
  }

  setSetting('db_seeded', true);
}
