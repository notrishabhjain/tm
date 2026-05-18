import type { TaskRepository } from '../../data/repositories/TaskRepository';

export async function deleteTask(repo: TaskRepository, id: string): Promise<void> {
  await repo.deleteTask(id);
}
