import { create } from 'zustand';
import type { Task, Priority } from '@/domain/types';

export type TaskFilter = Priority | 'ALL';

interface TaskState {
  pendingTasks: Task[];
  confirmationQueue: Task[];
  isLoading: boolean;
  error: string | null;
  activeFilter: TaskFilter;
  setActiveFilter: (filter: TaskFilter) => void;
  setPendingTasks: (tasks: Task[]) => void;
  setConfirmationQueue: (tasks: Task[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

export const useTaskStore = create<TaskState>((set) => ({
  pendingTasks: [],
  confirmationQueue: [],
  isLoading: false,
  error: null,
  activeFilter: 'ALL',
  setActiveFilter: (filter) => set({ activeFilter: filter }),
  setPendingTasks: (tasks) => set({ pendingTasks: tasks }),
  setConfirmationQueue: (tasks) => set({ confirmationQueue: tasks }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}));
