import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { getPriorityColor, Colors } from '../theme/colors';
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

function getPriorityShadow(priorityColor: string): string {
  const shadowMap: Record<string, string> = {
    [Colors.urgentFg]: Colors.neoShadowUrgent,
    [Colors.highFg]: Colors.neoShadowHigh,
    [Colors.mediumFg]: Colors.neoShadowMedium,
    [Colors.lowFg]: Colors.neoShadowLow,
  };
  return shadowMap[priorityColor] ?? Colors.neoShadowDefault;
}

function DueDateBadge({ dueDate }: { dueDate: number }): React.JSX.Element {
  const now = Date.now();
  const diffMs = dueDate - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let label: string;
  let bgColor: string;
  let textColor: string;
  if (diffMs < 0) {
    label = 'OVERDUE';
    bgColor = Colors.urgentBgLight;
    textColor = Colors.urgentFg;
  } else if (diffDays === 0) {
    label = 'TODAY';
    bgColor = '#FFF3CD';
    textColor = '#856404';
  } else if (diffDays === 1) {
    label = 'TOMORROW';
    bgColor = Colors.mediumBgLight;
    textColor = Colors.mediumFg;
  } else {
    const d = new Date(dueDate);
    label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    bgColor = Colors.surfaceVariantLight;
    textColor = Colors.onSurfaceVariantLight;
  }
  return (
    <View style={[styles.dueBadge, { backgroundColor: bgColor, borderColor: textColor }]}>
      <Text style={[styles.dueBadgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const DEPTH = 4;

export function TaskCard({
  task,
  onPress,
  onComplete,
  onDelete,
}: TaskCardProps): React.JSX.Element {
  const priorityColor = getPriorityColor(task.priority);
  const shadowColor = getPriorityShadow(priorityColor);

  const handlePress = useCallback(() => onPress?.(task), [onPress, task]);
  const handleComplete = useCallback(() => onComplete?.(task), [onComplete, task]);
  const handleDelete = useCallback(() => onDelete?.(task), [onDelete, task]);

  return (
    <View style={[styles.wrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
      {/* NeoPop depth shadow */}
      <View style={[styles.shadow, { backgroundColor: shadowColor }]} />

      {/* Main card */}
      <Pressable
        onPress={handlePress}
        style={({ pressed }) => [
          styles.card,
          { borderColor: priorityColor },
          pressed && { transform: [{ translateX: 2 }, { translateY: 2 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${task.priority} priority task: ${task.title}`}
      >
        {/* Priority indicator bar */}
        <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

        <View style={styles.content}>
          <Text style={styles.title} numberOfLines={2}>
            {task.title}
          </Text>

          <View style={styles.metaRow}>
            <Text style={styles.source} numberOfLines={1}>
              {task.sender ? `${task.sender} · ` : ''}
              {getSourceLabel(task.sourceApp)}
            </Text>
            <Text style={styles.time}>{formatRelativeTime(task.createdAt)}</Text>
          </View>

          <View style={styles.chipsRow}>
            <PriorityChip priority={task.priority} />
            {task.needsConfirmation && (
              <View style={[styles.confirmChip, { borderColor: Colors.primary500 }]}>
                <Text style={styles.confirmChipText}>CONFIRM</Text>
              </View>
            )}
            {task.dueDate && <DueDateBadge dueDate={task.dueDate} />}
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
            <Text style={[styles.actionText, { color: Colors.success }]}>Done</Text>
          </Pressable>
          <Pressable
            onPress={handleDelete}
            style={styles.actionButton}
            accessibilityLabel="Delete task"
            hitSlop={8}
          >
            <Text style={[styles.actionText, { color: Colors.urgentFg }]}>Del</Text>
          </Pressable>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 5,
    position: 'relative',
  },
  shadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderRadius: 2,
    overflow: 'hidden',
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
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onSurfaceLight,
    lineHeight: 21,
    marginBottom: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 7,
  },
  source: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    flex: 1,
    fontWeight: '500',
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
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmChipText: {
    fontSize: 10,
    fontWeight: '700',
    color: Colors.primary500,
    letterSpacing: 0.5,
  },
  dueBadge: {
    height: 22,
    paddingHorizontal: 8,
    borderRadius: 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  actions: {
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 8,
  },
  actionButton: {
    width: 44,
    height: 34,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: Colors.outlineLight,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.surfaceVariantLight,
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
