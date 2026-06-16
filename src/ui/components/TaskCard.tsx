import React, { useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated, PanResponder } from 'react-native';
import * as Haptics from 'expo-haptics';
import { getPriorityColor, Colors } from '../theme/colors';
import { useTheme } from '../theme';
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
  const d = new Date(ts);
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) {
    return d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) {
    return d.toLocaleDateString('en-IN', { weekday: 'short' });
  }
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
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

function DueDateBadge({ dueDate }: { dueDate: number }): React.JSX.Element {
  const now = Date.now();
  const diffMs = dueDate - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let label: string;
  let color: string;
  if (diffMs < 0) {
    label = 'Overdue';
    color = Colors.urgentFg;
  } else if (diffDays === 0) {
    label = 'Today';
    color = '#B45309';
  } else if (diffDays === 1) {
    label = 'Tomorrow';
    color = Colors.mediumFg;
  } else {
    const d = new Date(dueDate);
    label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    color = Colors.lowFg;
  }
  return (
    <View style={[styles.dueBadge, { borderColor: color + '40', backgroundColor: color + '14' }]}>
      <Text style={[styles.dueBadgeText, { color }]}>{label}</Text>
    </View>
  );
}

const SWIPE_THRESHOLD = 80;

export function TaskCard({
  task,
  onPress,
  onComplete,
  onDelete,
}: TaskCardProps): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(task.priority);
  const swipeX = useRef(new Animated.Value(0)).current;
  const swiping = useRef(false);

  const handlePress = useCallback(() => {
    if (swiping.current) return;
    void Haptics.selectionAsync();
    onPress?.(task);
  }, [onPress, task]);

  const handleComplete = useCallback(() => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onComplete?.(task);
  }, [onComplete, task]);

  const handleDelete = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onDelete?.(task);
  }, [onDelete, task]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 8 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderGrant: () => {
        swiping.current = true;
      },
      onPanResponderMove: (_, gs) => {
        swipeX.setValue(gs.dx);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx > SWIPE_THRESHOLD) {
          Animated.timing(swipeX, {
            toValue: 500,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            swipeX.setValue(0);
            swiping.current = false;
            handleComplete();
          });
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          Animated.timing(swipeX, {
            toValue: -500,
            duration: 200,
            useNativeDriver: true,
          }).start(() => {
            swipeX.setValue(0);
            swiping.current = false;
            handleDelete();
          });
        } else {
          swiping.current = false;
          Animated.spring(swipeX, {
            toValue: 0,
            useNativeDriver: true,
            bounciness: 6,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        swiping.current = false;
        Animated.spring(swipeX, { toValue: 0, useNativeDriver: true }).start();
      },
    })
  ).current;

  const completeOpacity = swipeX.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const deleteOpacity = swipeX.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.wrapper}>
      {/* Swipe reveal backgrounds */}
      <Animated.View style={[styles.swipeRevealLeft, { opacity: completeOpacity }]}>
        <Text style={styles.swipeIcon}>✓</Text>
        <Text style={styles.swipeLabel}>Done</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeRevealRight, { opacity: deleteOpacity }]}>
        <Text style={styles.swipeLabel}>Delete</Text>
        <Text style={styles.swipeIcon}>✕</Text>
      </Animated.View>

      {/* Swipeable card */}
      <Animated.View style={{ transform: [{ translateX: swipeX }] }} {...panResponder.panHandlers}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.card,
            { backgroundColor: theme.surface },
            pressed && !swiping.current && { opacity: 0.92 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${task.priority} priority: ${task.title}`}
        >
          {/* Priority accent bar */}
          <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

          <View style={styles.content}>
            <Text style={[styles.title, { color: theme.onSurface }]} numberOfLines={2}>
              {task.title}
            </Text>

            <View style={styles.metaRow}>
              <Text style={[styles.meta, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
                {task.sender ? `${task.sender} · ` : ''}
                {getSourceLabel(task.sourceApp)}
              </Text>
              <Text style={[styles.time, { color: theme.onSurfaceVariant }]}>
                {formatRelativeTime(task.createdAt)}
              </Text>
            </View>

            <View style={styles.badgeRow}>
              <PriorityChip priority={task.priority} />
              {task.dueDate && <DueDateBadge dueDate={task.dueDate} />}
              {task.needsConfirmation && (
                <View style={styles.reviewBadge}>
                  <Text style={styles.reviewBadgeText}>Review</Text>
                </View>
              )}
            </View>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginHorizontal: 16,
    marginVertical: 5,
    borderRadius: 14,
    overflow: 'hidden',
  },
  swipeRevealLeft: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.success,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 24,
    gap: 8,
  },
  swipeRevealRight: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.urgentFg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingRight: 24,
    gap: 8,
  },
  swipeIcon: { color: '#fff', fontWeight: '700', fontSize: 18 },
  swipeLabel: { color: '#fff', fontWeight: '600', fontSize: 13 },
  card: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.07,
    shadowRadius: 4,
    elevation: 2,
  },
  priorityBar: {
    width: 4,
    alignSelf: 'stretch',
  },
  content: {
    flex: 1,
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 5,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  meta: {
    fontSize: 12,
    flex: 1,
    fontWeight: '400',
  },
  time: {
    fontSize: 11,
    marginLeft: 8,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  dueBadge: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 5,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dueBadgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  reviewBadge: {
    height: 20,
    paddingHorizontal: 7,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: Colors.primary300,
    backgroundColor: Colors.primary50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  reviewBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary500,
  },
});
