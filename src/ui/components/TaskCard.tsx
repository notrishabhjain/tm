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
    return d.toLocaleDateString('en-IN', {
      weekday: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
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
  const theme = useTheme();
  const now = Date.now();
  const diffMs = dueDate - now;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let label: string;
  let bgColor: string;
  let textColor: string;
  if (diffMs < 0) {
    label = 'OVERDUE';
    bgColor = theme.urgentBg;
    textColor = Colors.urgentFg;
  } else if (diffDays === 0) {
    label = 'TODAY';
    bgColor = theme.isDark ? '#3D2E00' : '#FFF3CD';
    textColor = theme.isDark ? '#FFD166' : '#856404';
  } else if (diffDays === 1) {
    label = 'TOMORROW';
    bgColor = theme.mediumBg;
    textColor = Colors.mediumFg;
  } else {
    const d = new Date(dueDate);
    label = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    bgColor = theme.surfaceVariant;
    textColor = theme.onSurfaceVariant;
  }
  return (
    <View style={[styles.dueBadge, { backgroundColor: bgColor, borderColor: textColor }]}>
      <Text style={[styles.dueBadgeText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

const DEPTH = 4;
const SWIPE_THRESHOLD = 80;

export function TaskCard({
  task,
  onPress,
  onComplete,
  onDelete,
}: TaskCardProps): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(task.priority);
  const shadowColor = getPriorityShadow(priorityColor);
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
            duration: 180,
            useNativeDriver: true,
          }).start(() => {
            swipeX.setValue(0);
            swiping.current = false;
            handleComplete();
          });
        } else if (gs.dx < -SWIPE_THRESHOLD) {
          Animated.timing(swipeX, {
            toValue: -500,
            duration: 180,
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
            bounciness: 4,
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
    <View style={[styles.wrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
      {/* Swipe hint backgrounds */}
      <Animated.View style={[styles.swipeHintComplete, { opacity: completeOpacity }]}>
        <Text style={styles.swipeHintText}>✓ Done</Text>
      </Animated.View>
      <Animated.View style={[styles.swipeHintDelete, { opacity: deleteOpacity }]}>
        <Text style={styles.swipeHintText}>✕ Del</Text>
      </Animated.View>

      {/* NeoPop depth shadow */}
      <View style={[styles.shadow, { backgroundColor: shadowColor }]} />

      {/* Main card */}
      <Animated.View style={{ transform: [{ translateX: swipeX }] }} {...panResponder.panHandlers}>
        <Pressable
          onPress={handlePress}
          style={({ pressed }) => [
            styles.card,
            { borderColor: priorityColor, backgroundColor: theme.surface },
            pressed && !swiping.current && { transform: [{ translateX: 2 }, { translateY: 2 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${task.priority} priority task: ${task.title}`}
        >
          {/* Priority indicator bar */}
          <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

          <View style={styles.content}>
            <Text style={[styles.title, { color: theme.onSurface }]} numberOfLines={2}>
              {task.title}
            </Text>

            <View style={styles.metaRow}>
              <Text style={[styles.source, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
                {task.sender ? `${task.sender} · ` : ''}
                {getSourceLabel(task.sourceApp)}
              </Text>
              <Text style={[styles.time, { color: theme.onSurfaceVariant }]}>
                {formatRelativeTime(task.createdAt)}
              </Text>
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
              style={[
                styles.actionButton,
                { backgroundColor: theme.surfaceVariant, borderColor: theme.outline },
              ]}
              accessibilityLabel="Mark complete"
              hitSlop={8}
            >
              <Text style={[styles.actionText, { color: Colors.success }]}>Done</Text>
            </Pressable>
            <Pressable
              onPress={handleDelete}
              style={[
                styles.actionButton,
                { backgroundColor: theme.surfaceVariant, borderColor: theme.outline },
              ]}
              accessibilityLabel="Delete task"
              hitSlop={8}
            >
              <Text style={[styles.actionText, { color: Colors.urgentFg }]}>Del</Text>
            </Pressable>
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
    position: 'relative',
  },
  swipeHintComplete: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.success,
    borderRadius: 2,
    justifyContent: 'center',
    paddingLeft: 20,
  },
  swipeHintDelete: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: Colors.urgentFg,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'flex-end',
    paddingRight: 20,
  },
  swipeHintText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.5,
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
    flex: 1,
    fontWeight: '500',
  },
  time: {
    fontSize: 11,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
