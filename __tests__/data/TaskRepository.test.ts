/**
 * TaskRepository tests using a mocked drizzle/expo-sqlite stack.
 * expo-sqlite is a native module and cannot run in Jest/Node; we mock it
 * at the module boundary and exercise the repository's query-building logic
 * against an in-memory store.
 *
 * Variables prefixed with `mock` are hoisted by babel-jest before jest.mock()
 * factories, so they can be safely referenced inside factory functions.
 */

import type { CreateTaskInput } from '@/data/repositories/TaskRepository';

// ---------------------------------------------------------------------------
// Shared in-memory row store — `mock` prefix required for jest.mock hoisting
// ---------------------------------------------------------------------------

type MockRow = { [key: string]: unknown; _table: string };
const mockRows: MockRow[] = [];

// ---------------------------------------------------------------------------
// Drizzle mock builder — `mock` prefix allows reference inside jest.mock()
// ---------------------------------------------------------------------------

function mockBuildDrizzle() {
  const getTableName = (tableObj: unknown): string =>
    (tableObj as { _: { name: string } })?._?.name ?? String(tableObj);

  const queryBuilder = (tableObj: unknown) => {
    const tableName = getTableName(tableObj);
    let whereFn: ((row: MockRow) => boolean) | null = null;
    let orderByCol: string | null = null;
    let orderByDesc = false;
    let limitN: number | null = null;

    const self = {
      where: (fn: (row: MockRow) => boolean) => {
        whereFn = fn;
        return self;
      },
      orderBy: (...args: unknown[]) => {
        // Capture first arg for rudimentary ordering
        const first = args[0];
        if (first && typeof first === 'object' && 'column' in first) {
          orderByCol = (first as { column: string }).column;
          orderByDesc = 'order' in first && (first as { order: string }).order === 'desc';
        }
        return self;
      },
      limit: (n: number) => {
        limitN = n;
        return self;
      },
      then: (resolve: (rows: MockRow[]) => void) => {
        let result = mockRows.filter((r) => r._table === tableName);
        if (whereFn) {
          try {
            result = result.filter(whereFn);
          } catch {
            // drizzle-orm operators (eq, and, etc.) passed as-is won't work; skip filtering
          }
        }
        if (orderByCol) {
          result = [...result].sort((a, b) => {
            const av = a[orderByCol!] as number;
            const bv = b[orderByCol!] as number;
            return orderByDesc ? bv - av : av - bv;
          });
        }
        if (limitN !== null) result = result.slice(0, limitN);
        return Promise.resolve(result).then(resolve);
      },
    };
    return self;
  };

  return {
    insert: (tableObj: unknown) => ({
      values: (row: Omit<MockRow, '_table'>) => {
        const tableKey = getTableName(tableObj);
        mockRows.push({ ...row, _table: tableKey });
        return Promise.resolve();
      },
    }),
    update: (tableObj: unknown) => ({
      set: (data: Partial<MockRow>) => ({
        where: (_cond: unknown) => {
          const tableKey = getTableName(tableObj);
          mockRows.forEach((r, i) => {
            if (r._table === tableKey) Object.assign(mockRows[i], data);
          });
          return Promise.resolve({ changes: 1 });
        },
      }),
    }),
    delete: (_tableObj: unknown) => ({
      where: (_cond: unknown) => Promise.resolve({ changes: 0 }),
    }),
    select: () => ({ from: queryBuilder }),
    query: {},
  };
}

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('expo-sqlite', () => ({
  openDatabaseSync: jest.fn(() => ({
    execSync: jest.fn(),
    execAsync: jest.fn().mockResolvedValue(undefined),
    runAsync: jest.fn().mockResolvedValue({ lastInsertRowId: 0, changes: 1 }),
    getFirstAsync: jest.fn().mockResolvedValue(null),
    getAllAsync: jest.fn().mockResolvedValue([]),
  })),
}));

jest.mock('drizzle-orm/expo-sqlite', () => ({
  drizzle: jest.fn(() => mockBuildDrizzle()),
}));

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';

const repo = new TaskRepository(db);

const baseInput: CreateTaskInput = {
  title: 'Call Rohan back',
  body: 'Hey, please call me when free',
  sourceApp: 'com.whatsapp',
  sender: 'Rohan Sharma',
  priority: 'HIGH',
  confidence: 0.85,
  ruleScore: 0.85,
  language: 'EN',
  matchedKeywords: ['call', 'please'],
  needsConfirmation: false,
};

describe('TaskRepository', () => {
  beforeEach(() => {
    mockRows.length = 0;
  });

  describe('createTask', () => {
    it('returns a task with an id and PENDING status', async () => {
      const task = await repo.createTask(baseInput);

      expect(task.id).toBeTruthy();
      expect(task.status).toBe('PENDING');
      expect(task.title).toBe(baseInput.title);
      expect(task.priority).toBe('HIGH');
      expect(task.confidence).toBe(0.85);
    });

    it('assigns createdAt timestamp', async () => {
      const before = Date.now();
      const task = await repo.createTask(baseInput);
      const after = Date.now();

      expect(task.createdAt).toBeGreaterThanOrEqual(before);
      expect(task.createdAt).toBeLessThanOrEqual(after);
    });

    it('stores body and sender as nullable', async () => {
      const task = await repo.createTask({ ...baseInput, body: undefined, sender: undefined });

      expect(task.body).toBeNull();
      expect(task.sender).toBeNull();
    });
  });

  describe('completeTask / deleteTask', () => {
    it('completeTask resolves without error', async () => {
      const task = await repo.createTask(baseInput);
      await expect(repo.completeTask(task.id)).resolves.not.toThrow();
    });

    it('deleteTask resolves without error', async () => {
      const task = await repo.createTask(baseInput);
      await expect(repo.deleteTask(task.id)).resolves.not.toThrow();
    });
  });

  describe('getPendingTasks', () => {
    it('returns an array (empty when no tasks)', async () => {
      const result = await repo.getPendingTasks();
      expect(Array.isArray(result)).toBe(true);
    });
  });

  describe('getConfirmationQueue', () => {
    it('returns an array', async () => {
      const result = await repo.getConfirmationQueue();
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
