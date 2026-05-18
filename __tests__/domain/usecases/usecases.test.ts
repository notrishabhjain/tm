import { createTask } from '../../../src/domain/usecases/CreateTask';
import { completeTask } from '../../../src/domain/usecases/CompleteTask';
import { deleteTask } from '../../../src/domain/usecases/DeleteTask';
import { assignPriorityToTask } from '../../../src/domain/usecases/AssignPriority';
import type { TaskRepository } from '../../../src/data/repositories/TaskRepository';
import type { Task } from '../../../src/domain/types';

const TASK_STUB: Task = {
  id: 'task-1',
  title: 'Test task',
  body: null,
  sourceApp: 'com.test',
  sender: null,
  priority: 'LOW',
  status: 'PENDING',
  confidence: 0.9,
  needsConfirmation: false,
  createdAt: 1000000,
  completedAt: null,
  deletedAt: null,
};

function makeRepo(overrides: Partial<TaskRepository> = {}): TaskRepository {
  return {
    createTask: jest.fn().mockResolvedValue(TASK_STUB),
    getPendingTasks: jest.fn().mockResolvedValue([]),
    getConfirmationTasks: jest.fn().mockResolvedValue([]),
    getHistoryTasks: jest.fn().mockResolvedValue([]),
    getTaskById: jest.fn().mockResolvedValue(null),
    completeTask: jest.fn().mockResolvedValue(undefined),
    deleteTask: jest.fn().mockResolvedValue(undefined),
    updatePriority: jest.fn().mockResolvedValue(undefined),
    purgeOldArchivedTasks: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as TaskRepository;
}

describe('createTask usecase', () => {
  it('delegates to repo and returns result', async () => {
    const repo = makeRepo();
    const input = {
      title: 'Test task',
      body: 'Details',
      sourceApp: 'com.test',
      sender: null,
      priority: 'LOW' as const,
      confidence: 0.9,
      needsConfirmation: false,
      matchedKeywords: [],
      language: 'EN' as const,
    };
    const result = await createTask(repo, input);
    expect(repo.createTask).toHaveBeenCalledWith(input);
    expect(result).toBe(TASK_STUB);
  });
});

describe('completeTask usecase', () => {
  it('calls repo.completeTask with the given id', async () => {
    const repo = makeRepo();
    await completeTask(repo, 'task-1');
    expect(repo.completeTask).toHaveBeenCalledWith('task-1');
  });
});

describe('deleteTask usecase', () => {
  it('calls repo.deleteTask with the given id', async () => {
    const repo = makeRepo();
    await deleteTask(repo, 'task-1');
    expect(repo.deleteTask).toHaveBeenCalledWith('task-1');
  });
});

describe('assignPriorityToTask usecase', () => {
  it('calls repo.updatePriority with id and priority', async () => {
    const repo = makeRepo();
    await assignPriorityToTask(repo, 'task-1', 'URGENT');
    expect(repo.updatePriority).toHaveBeenCalledWith('task-1', 'URGENT');
  });
});
