import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPriorityColor } from '../theme/colors';
import { useTheme } from '../theme';
import type { Priority } from '@/domain/types';

interface PriorityChipProps {
  priority: Priority;
  variant?: 'filled' | 'outlined';
}

const LABELS: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Med',
  LOW: 'Low',
};

export function PriorityChip({
  priority,
  variant = 'filled',
}: PriorityChipProps): React.JSX.Element {
  const theme = useTheme();
  const color = getPriorityColor(priority);
  const bgMap: Record<Priority, string> = {
    URGENT: theme.urgentBg,
    HIGH: theme.highBg,
    MEDIUM: theme.mediumBg,
    LOW: theme.lowBg,
  };
  const bgColor = bgMap[priority];

  return (
    <View
      style={[
        styles.chip,
        variant === 'filled'
          ? { backgroundColor: bgColor }
          : { borderWidth: 1, borderColor: color, backgroundColor: 'transparent' },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{LABELS[priority]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 6,
    justifyContent: 'center',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.1,
  },
});
