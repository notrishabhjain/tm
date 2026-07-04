import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { Button } from '@/ui/components/Button';
import { db } from '@/data/db/client';
import { CallRecordRepository } from '@/data/repositories/CallRecordRepository';
import { confirmReviewTask, rejectReviewTask } from '@/services/review-actions';
import { refreshWidget } from '@/services/task-actions';
import type { Task } from '@/domain/types';

const callRecordRepo = new CallRecordRepository(db);

function formatCallMeta(callTime: number, durationSec: number | null): string {
  const d = new Date(callTime);
  const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  const durStr =
    durationSec != null
      ? ` · ${Math.floor(durationSec / 60)}:${String(durationSec % 60).padStart(2, '0')} min`
      : '';
  return `${dateStr}, ${timeStr}${durStr}`;
}

/**
 * Post-call review: shows the call record the native pipeline stored (caller,
 * summary, topics) and its extracted tasks with confirm/reject. The tasks are
 * regular Review items (needsConfirmation=1), so anything not handled here
 * also remains in the Review tab.
 */
export default function CallReviewScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [handled, setHandled] = useState<Set<string>>(new Set());

  const { data, isLoading } = useQuery({
    queryKey: ['call-record', id],
    queryFn: async () => {
      const record = await callRecordRepo.getById(id ?? '');
      if (!record) return null;
      const tasks = await callRecordRepo.getTasksForRecord(record);
      return { record, tasks: tasks.filter((t) => t.deletedAt === null) };
    },
    enabled: !!id,
  });

  const markHandled = (taskId: string): void => {
    setHandled((prev) => new Set(prev).add(taskId));
  };

  const confirmMutation = useMutation({
    mutationFn: (task: Task) => confirmReviewTask(task),
    onMutate: (task: Task) => markHandled(task.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      refreshWidget();
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (task: Task) => rejectReviewTask(task),
    onMutate: (task: Task) => markHandled(task.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      refreshWidget();
    },
  });

  const close = (): void => {
    if (id) void callRecordRepo.markReviewed(id).catch(() => {});
    router.replace('/(tabs)/');
  };

  if (isLoading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={Colors.primary500} />
      </View>
    );
  }

  if (!data) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.notFound, { color: theme.onSurface }]}>
          Call record not found — it may have been cleared.
        </Text>
        <Button label="Go to Home" variant="secondary" onPress={() => router.replace('/(tabs)/')} />
      </View>
    );
  }

  const { record, tasks } = data;
  const pending = tasks.filter((t) => !handled.has(t.id) && t.needsConfirmation);

  return (
    <Screen>
      <LargeHeader
        title={`Call with ${record.callerLabel}`}
        subtitle={formatCallMeta(record.callTime, record.durationSec)}
        onBack={close}
      />

      <FlatList
        data={pending}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.headerBlock}>
            {record.summary ? (
              <View
                style={[
                  styles.summaryCard,
                  { backgroundColor: theme.surface, borderColor: theme.outline },
                ]}
              >
                <Text style={[styles.summaryLabel, { color: theme.onSurfaceVariant }]}>
                  Summary
                </Text>
                <Text style={[styles.summaryText, { color: theme.onSurface }]}>
                  {record.summary}
                </Text>
                {record.topics.length > 0 && (
                  <View style={styles.topicsRow}>
                    {record.topics.map((topic) => (
                      <Text
                        key={topic}
                        style={[
                          styles.topicChip,
                          { color: theme.primary, borderColor: theme.outline },
                        ]}
                      >
                        {topic}
                      </Text>
                    ))}
                  </View>
                )}
              </View>
            ) : null}
            {pending.length > 0 && (
              <Text style={[styles.tasksLabel, { color: theme.onSurfaceVariant }]}>
                {pending.length} task{pending.length !== 1 ? 's' : ''} to review
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => (
          <CallTaskCard
            task={item}
            onConfirm={() => confirmMutation.mutate(item)}
            onReject={() => rejectMutation.mutate(item)}
          />
        )}
        ListEmptyComponent={
          <View style={styles.emptyBlock}>
            <Text style={[styles.emptyText, { color: theme.onSurfaceVariant }]}>
              {tasks.length > 0
                ? 'All tasks handled ✓'
                : 'No action items were found in this call.'}
            </Text>
          </View>
        }
      />

      <View style={styles.footer}>
        <Button label="Done" onPress={close} fullWidth />
      </View>
    </Screen>
  );
}

function CallTaskCard({
  task,
  onConfirm,
  onReject,
}: {
  task: Task;
  onConfirm: () => void;
  onReject: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(task.priority);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <View style={styles.cardTop}>
        <View style={[styles.dot, { backgroundColor: priorityColor }]} />
        <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{task.title}</Text>
      </View>
      <View style={styles.cardMeta}>
        <PriorityChip priority={task.priority} />
        {task.dueDate ? (
          <Text style={[styles.dueText, { color: priorityColor }]}>
            {new Date(task.dueDate).toLocaleDateString('en-IN', {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        ) : null}
      </View>
      <View style={styles.buttonRow}>
        <Pressable
          onPress={onConfirm}
          style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Add as task"
        >
          <Text style={styles.confirmBtnText}>Add task</Text>
        </Pressable>
        <Pressable
          onPress={onReject}
          style={({ pressed }) => [
            styles.rejectBtn,
            { backgroundColor: theme.surfaceVariant },
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Skip"
        >
          <Text style={[styles.rejectBtnText, { color: theme.onSurfaceVariant }]}>Skip</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  notFound: { fontSize: 14, textAlign: 'center', lineHeight: 22 },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 10 },
  footer: { padding: 16, paddingTop: 10 },
  headerBlock: { gap: 12, paddingBottom: 4 },
  summaryCard: { borderRadius: 16, borderWidth: 0.5, padding: 14, gap: 6 },
  summaryLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },
  summaryText: { fontSize: 14, lineHeight: 21 },
  topicsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  topicChip: {
    fontSize: 12,
    fontWeight: '600',
    borderWidth: 0.5,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  tasksLabel: { fontSize: 13, fontWeight: '600' },
  emptyBlock: { paddingVertical: 32, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  card: { borderRadius: 16, borderWidth: 0.5, padding: 14, gap: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },
  cardTitle: { fontSize: 15, fontWeight: '600', lineHeight: 21, flex: 1 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dueText: { fontSize: 12, fontWeight: '600' },
  buttonRow: { flexDirection: 'row', gap: 10 },
  confirmBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: Colors.primary500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  rejectBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '600' },
});
