import type { Priority } from '../types';
import type { TaskRepository } from '../../data/repositories/TaskRepository';

export async function assignPriorityToTask(
  repo: TaskRepository,
  id: string,
  priority: Priority
): Promise<void> {
  await repo.updatePriority(id, priority);
}
