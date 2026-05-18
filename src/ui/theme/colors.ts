/**
 * TaskMind design token colors.
 * Per UI/UX Design Specification Section 2.1.
 */

export const Primary = {
  900: '#0A2540',
  700: '#1E3A5F',
  500: '#2E5B8E',
  300: '#6B8FBF',
  100: '#D5E2F2',
  50: '#F2F6FB',
} as const;

export const PriorityColors = {
  URGENT: {
    base: '#D62828',
    lightBg: '#FCE5E5',
    darkBg: '#4A1010',
  },
  HIGH: {
    base: '#E76F00',
    lightBg: '#FDEBD3',
    darkBg: '#4A2810',
  },
  MEDIUM: {
    base: '#2E5B8E',
    lightBg: '#D5E2F2',
    darkBg: '#1A2F4A',
  },
  LOW: {
    base: '#6B7785',
    lightBg: '#E8EBEE',
    darkBg: '#2A3138',
  },
} as const;

export const Light = {
  surface: '#FFFFFF',
  surfaceVariant: '#F4F6F8',
  outline: '#D6DAE0',
  onSurface: '#1A1D21',
  onSurfaceVariant: '#4A5159',
  background: '#F2F6FB',
} as const;

export const Dark = {
  surface: '#121417',
  surfaceVariant: '#1A1D21',
  outline: '#2E3338',
  onSurface: '#ECEEF1',
  onSurfaceVariant: '#A8B0B9',
  background: '#0E1116',
} as const;

export const Semantic = {
  success: '#2E8540',
  warning: '#E76F00',
  error: '#D62828',
  info: '#2E5B8E',
} as const;
