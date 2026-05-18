import { migrate } from 'drizzle-orm/expo-sqlite/migrator';
import migrations from './migrations/0000_cloudy_bromley.sql';
import { db } from './client';

/**
 * Run all pending Drizzle migrations.
 * Call once at app startup, before any DB access.
 */
export async function runMigrations(): Promise<void> {
  await migrate(db, migrations);
}
