import type { TaskRepository } from '../../data/repositories/TaskRepository';

export async function completeTask(repo: TaskRepository, id: string): Promise<void> {
  await repo.completeTask(id);
}
