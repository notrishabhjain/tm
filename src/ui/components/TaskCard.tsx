import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { getPriorityColor } from '../theme/colors';
import { Colors } from '../theme/colors';
import { PriorityChip } from './PriorityChip';
import type { Task } from '@/domain/types';

interface TaskCardProps {
  task: Task;
  onPress?: (task: Task) => void;
  onComplete?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}

function formatRelativeTime(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  return `${diffDays}d ago`;
}

function getSourceLabel(sourceApp: string): string {
  const labels: Record<string, string> = {
    'com.whatsapp': 'WhatsApp',
    'com.google.android.gm': 'Gmail',
    'com.Slack': 'Slack',
    'org.thoughtcrime.securesms': 'Signal',
    'com.microsoft.teams': 'Teams',
    'org.telegram.messenger': 'Telegram',
    'com.android.mms': 'SMS',
  };
  return labels[sourceApp] ?? sourceApp.split('.').pop() ?? sourceApp;
}

export function TaskCard({
  task,
  onPress,
  onComplete,
  onDelete,
}: TaskCardProps): React.JSX.Element {
  const priorityColor = getPriorityColor(task.priority);

  const handlePress = useCallback(() => onPress?.(task), [onPress, task]);
  const handleComplete = useCallback(() => onComplete?.(task), [onComplete, task]);
  const handleDelete = useCallback(() => onDelete?.(task), [onDelete, task]);

  return (
    <Pressable
      onPress={handlePress}
      style={({ pressed }) => [styles.container, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${task.priority} priority task: ${task.title}`}
    >
      {/* Priority indicator bar */}
      <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

      <View style={styles.content}>
        {/* Task title */}
        <Text style={styles.title} numberOfLines={2}>
          {task.title}
        </Text>

        {/* Source and time row */}
        <View style={styles.metaRow}>
          <Text style={styles.source}>
            {task.sender ? `${task.sender} · ` : ''}
            {getSourceLabel(task.sourceApp)}
          </Text>
          <Text style={styles.time}>{formatRelativeTime(task.createdAt)}</Text>
        </View>

        {/* Chips row */}
        <View style={styles.chipsRow}>
          <PriorityChip priority={task.priority} />
          {task.needsConfirmation && (
            <View style={styles.confirmChip}>
              <Text style={styles.confirmChipText}>CONFIRM</Text>
            </View>
          )}
        </View>
      </View>

      {/* Quick actions */}
      <View style={styles.actions}>
        <Pressable
          onPress={handleComplete}
          style={styles.actionButton}
          accessibilityLabel="Mark complete"
          hitSlop={8}
        >
          <Text style={styles.completeIcon}>✓</Text>
        </Pressable>
        <Pressable
          onPress={handleDelete}
          style={styles.actionButton}
          accessibilityLabel="Delete task"
          hitSlop={8}
        >
          <Text style={styles.deleteIcon}>✕</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 8,
    elevation: 2,
    overflow: 'hidden',
  },
  pressed: {
    opacity: 0.9,
  },
  priorityBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    padding: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.onSurfaceLight,
    lineHeight: 22,
    marginBottom: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  source: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    flex: 1,
  },
  time: {
    fontSize: 11,
    color: Colors.onSurfaceVariantLight,
    marginLeft: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  confirmChip: {
    height: 24,
    paddingHorizontal: 10,
    borderRadius: 4,
    backgroundColor: Colors.primary100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary500,
    letterSpacing: 0.5,
  },
  actions: {
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariantLight,
  },
  completeIcon: {
    fontSize: 16,
    color: Colors.success,
    fontWeight: '700',
  },
  deleteIcon: {
    fontSize: 14,
    color: Colors.error,
    fontWeight: '700',
  },
});
