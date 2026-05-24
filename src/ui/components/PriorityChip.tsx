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
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MED',
  LOW: 'LOW',
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
          ? { backgroundColor: bgColor, borderColor: color }
          : { borderColor: color, backgroundColor: 'transparent' },
      ]}
    >
      <Text style={[styles.label, { color }]}>{LABELS[priority]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
});
