type Priority = 'URGENT' | 'HIGH' | 'MEDIUM' | 'LOW';

export const Colors = {
  // Primary brand — electric violet ramp
  primary900: '#6C4BF0', // primary fill (buttons, FAB, active states)
  primary700: '#5B3FD6',
  primary500: '#7C5CFC', // accent
  primary300: '#B9A8FF', // dark-mode accent text
  primary100: '#E9E3FF',
  primary50: '#F5F2FF',

  // Priority semantic colors
  urgentFg: '#E5484D',
  urgentBgLight: '#FDECEC',
  urgentBgDark: '#3A1718',
  highFg: '#F76B15',
  highBgLight: '#FEF0E4',
  highBgDark: '#3A2410',
  mediumFg: '#3B82F6',
  mediumBgLight: '#E8F0FE',
  mediumBgDark: '#15233A',
  lowFg: '#8A8A8E',
  lowBgLight: '#F2F2F4',
  lowBgDark: '#27272A',

  // Neutral surfaces — near-monochrome, hairline dividers
  surfaceLight: '#FFFFFF',
  surfaceDark: '#161618',
  backgroundLight: '#FFFFFF',
  backgroundDark: '#0C0C0E',
  surfaceVariantLight: '#F5F5F7',
  surfaceVariantDark: '#1F1F22',
  outlineLight: '#ECECEE',
  outlineDark: '#2A2A2D',
  onSurfaceLight: '#18181B',
  onSurfaceDark: '#F4F4F5',
  onSurfaceVariantLight: '#8A8A8E',
  onSurfaceVariantDark: '#9A9AA0',

  // Status colors
  success: '#2BA168',
  successBg: '#E6F6EE',
  warning: '#F76B15',
  error: '#E5484D',
  info: '#3B82F6',

  // Misc
  white: '#FFFFFF',
  black: '#000000',
  transparent: 'transparent',

  // Legacy depth-shadow keys (kept for compatibility; soft shadows used instead)
  neoShadowDefault: '#4A2FB8',
  neoShadowUrgent: '#A82F33',
  neoShadowHigh: '#B04E0F',
  neoShadowMedium: '#2A5FB8',
  neoShadowLow: '#5A5A5E',
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
