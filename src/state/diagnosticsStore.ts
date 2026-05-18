import { create } from 'zustand';
import {
  getNotificationBuffer,
  getExtractionBuffer,
  clearDiagnostics,
} from '@/services/diagnostics-logger';
import type { CapturedNotification, ExtractionDecisionLog } from '@/services/diagnostics-logger';

interface DiagnosticsStore {
  notificationBuffer: CapturedNotification[];
  extractionBuffer: ExtractionDecisionLog[];
  isLoading: boolean;
  refresh: () => void;
  clear: () => void;
}

export const useDiagnosticsStore = create<DiagnosticsStore>((set) => ({
  notificationBuffer: [],
  extractionBuffer: [],
  isLoading: false,

  refresh: () => {
    set({ isLoading: true });
    try {
      const notificationBuffer = getNotificationBuffer();
      const extractionBuffer = getExtractionBuffer();
      set({ notificationBuffer, extractionBuffer, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  clear: () => {
    clearDiagnostics();
    set({ notificationBuffer: [], extractionBuffer: [] });
  },
}));
