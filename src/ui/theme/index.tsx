import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { Colors } from './colors';
import { getSetting } from '@/data/storage/settings';

export { Colors, getPriorityColor, getPriorityBgLight } from './colors';
export { Typography } from './typography';
export { Spacing, Radius, TouchTarget } from './spacing';

export interface Theme {
  isDark: boolean;
  colors: typeof Colors;
  surface: string;
  background: string;
  surfaceVariant: string;
  outline: string;
  onSurface: string;
  onSurfaceVariant: string;
}

function buildTheme(isDark: boolean): Theme {
  return {
    isDark,
    colors: Colors,
    surface: isDark ? Colors.surfaceDark : Colors.surfaceLight,
    background: isDark ? Colors.backgroundDark : Colors.backgroundLight,
    surfaceVariant: isDark ? Colors.surfaceVariantDark : Colors.surfaceVariantLight,
    outline: isDark ? Colors.outlineDark : Colors.outlineLight,
    onSurface: isDark ? Colors.onSurfaceDark : Colors.onSurfaceLight,
    onSurfaceVariant: isDark ? Colors.onSurfaceVariantDark : Colors.onSurfaceVariantLight,
  };
}

const ThemeContext = createContext<Theme>(buildTheme(false));

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const systemScheme = useColorScheme();
  const themeSetting = getSetting('theme');
  const isDark = themeSetting === 'dark' || (themeSetting === 'system' && systemScheme === 'dark');
  return <ThemeContext.Provider value={buildTheme(isDark)}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}
