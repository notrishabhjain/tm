import { create } from 'zustand';
import { getSetting, setSetting, type AppSettings } from '@/data/storage/settings';

interface SettingsState {
  onboardingComplete: boolean;
  theme: AppSettings['theme'];
  nudgeFreqMinutes: number;
  quietHoursStart: string;
  quietHoursEnd: string;
  urgentOverrideQuiet: boolean;
  updateTheme: (theme: AppSettings['theme']) => void;
  updateNudgeFreq: (minutes: number) => void;
  updateQuietHours: (start: string, end: string) => void;
  updateUrgentOverride: (override: boolean) => void;
  setOnboardingComplete: (complete: boolean) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  onboardingComplete: getSetting('onboarding_complete'),
  theme: getSetting('theme'),
  nudgeFreqMinutes: getSetting('nudge_freq_minutes'),
  quietHoursStart: getSetting('quiet_hours_start'),
  quietHoursEnd: getSetting('quiet_hours_end'),
  urgentOverrideQuiet: getSetting('urgent_override_quiet'),

  updateTheme: (theme) => {
    setSetting('theme', theme);
    set({ theme });
  },
  updateNudgeFreq: (minutes) => {
    setSetting('nudge_freq_minutes', minutes);
    set({ nudgeFreqMinutes: minutes });
  },
  updateQuietHours: (start, end) => {
    setSetting('quiet_hours_start', start);
    setSetting('quiet_hours_end', end);
    set({ quietHoursStart: start, quietHoursEnd: end });
  },
  updateUrgentOverride: (override) => {
    setSetting('urgent_override_quiet', override);
    set({ urgentOverrideQuiet: override });
  },
  setOnboardingComplete: (complete) => {
    setSetting('onboarding_complete', complete);
    set({ onboardingComplete: complete });
  },
}));
