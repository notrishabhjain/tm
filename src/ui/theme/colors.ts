import type { Priority } from '@/domain/types';

export const Colors = {
  // Primary brand
  primary900: '#0A2540',
  primary700: '#1E3A5F',
  primary500: '#2E5B8E',
  primary300: '#6B8FBF',
  primary100: '#D5E2F2',
  primary50: '#F2F6FB',

  // Priority semantic colors — non-negotiable
  urgentFg: '#D62828',
  urgentBgLight: '#FCE5E5',
  urgentBgDark: '#4A1010',
  highFg: '#E76F00',
  highBgLight: '#FDEBD3',
  highBgDark: '#4A2810',
  mediumFg: '#2E5B8E',
  mediumBgLight: '#D5E2F2',
  mediumBgDark: '#1A2F4A',
  lowFg: '#6B7785',
  lowBgLight: '#E8EBEE',
  lowBgDark: '#2A3138',

  // Neutral surfaces
  surfaceLight: '#FFFFFF',
  surfaceDark: '#1A1D21',
  backgroundLight: '#F2F6FB',
  backgroundDark: '#0E1116',
  surfaceVariantLight: '#F4F6F8',
  surfaceVariantDark: '#1A1D21',
  outlineLight: '#D6DAE0',
  outlineDark: '#2E3338',
  onSurfaceLight: '#1A1D21',
  onSurfaceDark: '#ECEEF1',
  onSurfaceVariantLight: '#4A5159',
  onSurfaceVariantDark: '#A8B0B9',

  // Status colors
  success: '#2E8540',
  successBg: '#E8F5E9',
  warning: '#E76F00',
  error: '#D62828',
  info: '#2E5B8E',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',
} as const;

export function getPriorityColor(priority: Priority): string {
  const map: Record<Priority, string> = {
    URGENT: Colors.urgentFg,
    HIGH: Colors.highFg,
    MEDIUM: Colors.mediumFg,
    LOW: Colors.lowFg,
  };
  return map[priority];
}

export function getPriorityBgLight(priority: Priority): string {
  const map: Record<Priority, string> = {
    URGENT: Colors.urgentBgLight,
    HIGH: Colors.highBgLight,
    MEDIUM: Colors.mediumBgLight,
    LOW: Colors.lowBgLight,
  };
  return map[priority];
}
