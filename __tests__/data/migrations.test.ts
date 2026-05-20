/**
 * Database migration tests.
 * expo-sqlite is a native module; we mock it and verify that initializeDatabase
 * (1) does not throw on first run, (2) is idempotent, (3) creates all expected tables.
 */

// Mock functions must be created INSIDE the factory (jest.mock is hoisted before variable
// declarations, so references to outer `const` variables would be undefined).
jest.mock('expo-sqlite', () => {
  const execSync = jest.fn();
  return {
    __esModule: true,
    openDatabaseSync: jest.fn(() => ({ execSync })),
    _getExecSync: () => execSync,
  };
});

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => ({})),
}));

import { initializeDatabase } from '@/data/db/client';

function getExecSyncMock(): jest.Mock {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jest.requireMock('expo-sqlite') as any)._getExecSync() as jest.Mock;
}

describe('Database migrations', () => {
  beforeEach(() => {
    getExecSyncMock().mockClear();
  });

  it('initializes without throwing', () => {
    expect(() => initializeDatabase()).not.toThrow();
  });

  it('is idempotent — safe to call twice', () => {
    initializeDatabase();
    expect(() => initializeDatabase()).not.toThrow();
  });

  it('enables WAL journal mode', () => {
    initializeDatabase();
    const calls: string[] = getExecSyncMock().mock.calls.map((c: unknown[]) => String(c[0]));
    expect(calls.some((sql) => sql.includes('WAL'))).toBe(true);
  });

  it('creates all 8 expected tables', () => {
    initializeDatabase();
    const allSql = getExecSyncMock()
      .mock.calls.map((c: unknown[]) => String(c[0]))
      .join('\n');

    const expectedTables = [
      'tasks',
      'vip_contacts',
      'monitored_apps',
      'seed_keywords',
      'learned_keywords',
      'sender_stats',
      'training_log',
      'discarded_log',
    ];

    for (const table of expectedTables) {
      expect(allSql).toContain(table);
    }
  });

  it('uses IF NOT EXISTS for all CREATE TABLE statements', () => {
    initializeDatabase();
    const allSql = getExecSyncMock()
      .mock.calls.map((c: unknown[]) => String(c[0]))
      .join('\n');
    const allCreate = (allSql.match(/CREATE TABLE/gi) ?? []).length;
    const safeCreate = (allSql.match(/CREATE TABLE IF NOT EXISTS/gi) ?? []).length;
    expect(safeCreate).toBe(allCreate);
  });
});
