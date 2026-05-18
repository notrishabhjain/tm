import type { Task } from '../types';
import type { TaskRepository, CreateTaskInput } from '../../data/repositories/TaskRepository';

export type { CreateTaskInput };

export async function createTask(repo: TaskRepository, input: CreateTaskInput): Promise<Task> {
  return repo.createTask(input);
}
