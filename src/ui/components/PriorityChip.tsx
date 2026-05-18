import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { getPriorityColor, getPriorityBgLight, Colors } from '../theme/colors';
import type { Priority } from '@/domain/types';

interface PriorityChipProps {
  priority: Priority;
  variant?: 'filled' | 'outlined';
}

const LABELS: Record<Priority, string> = {
  URGENT: 'URGENT',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
};

export function PriorityChip({
  priority,
  variant = 'filled',
}: PriorityChipProps): React.JSX.Element {
  const color = getPriorityColor(priority);
  const bgColor = getPriorityBgLight(priority);

  if (variant === 'outlined') {
    return (
      <View
        style={[
          styles.chip,
          { borderColor: color, borderWidth: 1, backgroundColor: Colors.transparent },
        ]}
      >
        <Text style={[styles.label, { color }]}>{LABELS[priority]}</Text>
      </View>
    );
  }

  return (
    <View style={[styles.chip, { backgroundColor: bgColor }]}>
      <Text style={[styles.label, { color }]}>{LABELS[priority]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
