import React from 'react';
import { View, Text, StyleSheet, Pressable, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme';

interface ScreenProps {
  children: React.ReactNode;
  style?: ViewStyle;
}

/**
 * Base screen container that applies the top safe-area inset so content never
 * sits under the status bar, and paints the themed background.
 */
export function Screen({ children, style }: ScreenProps): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.screen, { backgroundColor: theme.background, paddingTop: insets.top }, style]}
    >
      {children}
    </View>
  );
}

interface LargeHeaderProps {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

/** Big, calm title header in the minimal-monochrome style. */
export function LargeHeader({
  title,
  subtitle,
  right,
  onBack,
}: LargeHeaderProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.header}>
      {onBack && (
        <Pressable onPress={onBack} hitSlop={10} style={styles.backBtn} accessibilityRole="button">
          <Text style={[styles.backText, { color: theme.primary }]}>‹ Back</Text>
        </Pressable>
      )}
      <View style={styles.headerRow}>
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>
          {subtitle ? (
            <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>{subtitle}</Text>
          ) : null}
        </View>
        {right ? <View style={styles.headerRight}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  backBtn: { marginBottom: 6 },
  backText: { fontSize: 16, fontWeight: '500' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  headerTitleWrap: { flex: 1 },
  title: { fontSize: 32, fontWeight: '700', letterSpacing: -0.8 },
  subtitle: { fontSize: 14, marginTop: 2, fontWeight: '400' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
});
