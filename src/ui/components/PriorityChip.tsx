import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPriorityColor } from '../theme/colors';
import type { Priority } from '@/domain/types';

interface PriorityChipProps {
  priority: Priority;
  variant?: 'filled' | 'outlined';
}

const LABELS: Record<Priority, string> = {
  URGENT: 'Urgent',
  HIGH: 'High',
  MEDIUM: 'Medium',
  LOW: 'Low',
};

export function PriorityChip({ priority }: PriorityChipProps): React.JSX.Element {
  const color = getPriorityColor(priority);
  return (
    <View style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{LABELS[priority]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: '600', letterSpacing: 0.1 },
});
