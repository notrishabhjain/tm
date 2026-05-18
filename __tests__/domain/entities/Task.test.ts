import {
  createTaskEntity,
  isTaskActionable,
  isPriorityAbove,
} from '../../../src/domain/entities/Task';
import type { Task } from '../../../src/domain/types';

const BASE: Parameters<typeof createTaskEntity>[0] = {
  id: 'task-1',
  title: 'Send the report',
  body: null,
  sourceApp: 'com.whatsapp',
  sender: 'Alice',
  priority: 'MEDIUM',
  status: 'PENDING',
  confidence: 0.8,
  needsConfirmation: false,
  createdAt: 1000000,
  completedAt: null,
  deletedAt: null,
};

describe('createTaskEntity', () => {
  it('returns task when params are valid', () => {
    const task = createTaskEntity(BASE);
    expect(task.id).toBe('task-1');
    expect(task.title).toBe('Send the report');
  });

  it('throws when title is empty', () => {
    expect(() => createTaskEntity({ ...BASE, title: '' })).toThrow('Task title cannot be empty');
  });

  it('throws when title is only whitespace', () => {
    expect(() => createTaskEntity({ ...BASE, title: '   ' })).toThrow('Task title cannot be empty');
  });

  it('throws when confidence < 0', () => {
    expect(() => createTaskEntity({ ...BASE, confidence: -0.1 })).toThrow('Confidence must be 0-1');
  });

  it('throws when confidence > 1', () => {
    expect(() => createTaskEntity({ ...BASE, confidence: 1.1 })).toThrow('Confidence must be 0-1');
  });

  it('accepts confidence boundary values 0 and 1', () => {
    expect(() => createTaskEntity({ ...BASE, confidence: 0 })).not.toThrow();
    expect(() => createTaskEntity({ ...BASE, confidence: 1 })).not.toThrow();
  });
});

function makeTask(overrides: Partial<Task> = {}): Task {
  return createTaskEntity({ ...BASE, ...overrides });
}

describe('isTaskActionable', () => {
  it('returns true for PENDING task with no deletedAt', () => {
    expect(isTaskActionable(makeTask())).toBe(true);
  });

  it('returns false for DONE task', () => {
    expect(isTaskActionable(makeTask({ status: 'DONE' }))).toBe(false);
  });

  it('returns false for soft-deleted task', () => {
    expect(isTaskActionable(makeTask({ deletedAt: Date.now() }))).toBe(false);
  });
});

describe('isPriorityAbove', () => {
  it('URGENT >= MEDIUM', () => {
    expect(isPriorityAbove(makeTask({ priority: 'URGENT' }), 'MEDIUM')).toBe(true);
  });

  it('LOW is not >= MEDIUM', () => {
    expect(isPriorityAbove(makeTask({ priority: 'LOW' }), 'MEDIUM')).toBe(false);
  });

  it('MEDIUM >= MEDIUM (same level)', () => {
    expect(isPriorityAbove(makeTask({ priority: 'MEDIUM' }), 'MEDIUM')).toBe(true);
  });
});
