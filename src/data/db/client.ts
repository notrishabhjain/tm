import { drizzle } from 'drizzle-orm/expo-sqlite';
import { openDatabaseSync } from 'expo-sqlite';
import * as schema from './schema';

/**
 * Singleton SQLite database instance.
 * Migrations are run on first import (in app entry point).
 */
const sqlite = openDatabaseSync('taskmind.db', { enableChangeListener: true });

export const db = drizzle(sqlite, { schema });

export type Database = typeof db;
