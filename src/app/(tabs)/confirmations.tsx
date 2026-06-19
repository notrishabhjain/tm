import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { EmptyState } from '@/ui/components/EmptyState';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { SenderStatsRepository } from '@/data/repositories/SenderStatsRepository';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { LearnedKeywordRepository } from '@/data/repositories/LearnedKeywordRepository';
import { db } from '@/data/db/client';
import { extractNgrams, languageForText } from '@/services/ngram-extractor';
import { buildSenderKey } from '@/services/signal-scorer';
import { createGoogleTask } from '@/services/google-tasks';
import { appDisplayName } from '@/services/app-name-map';
import { getSetting } from '@/data/storage/settings';
import type { Task } from '@/domain/types';

const taskRepo = new TaskRepository(db);
const senderStatsRepo = new SenderStatsRepository(db);
const discardedRepo = new DiscardedLogRepository(db);
const learnedKwRepo = new LearnedKeywordRepository(db);

export default function ConfirmationsScreen(): React.JSX.Element {
  const queryClient = useQueryClient();

  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'confirmation'],
    queryFn: () => taskRepo.getConfirmationQueue(),
    refetchInterval: 5000,
  });

  const confirmMutation = useMutation({
    mutationFn: async (task: Task) => {
      await taskRepo.confirmTask(task.id);
      const senderKey = buildSenderKey(task.sourceApp, task.sender ?? '');
      await senderStatsRepo.incrementConfirm(senderKey);
      const text = task.body ?? task.title;
      const ngrams = extractNgrams(text, 'EN');
      if (ngrams.length > 0) {
        try {
          await learnedKwRepo.recordNgrams(ngrams, languageForText('EN'));
        } catch {
          // Non-fatal
        }
      }
      if (getSetting('google_tasks_enabled') && !task.googleTaskId) {
        const notesLines: string[] = [`Source: ${appDisplayName(task.sourceApp)}`];
        if (task.body) notesLines.push(`\nContext:\n${task.body.slice(0, 500)}`);
        void createGoogleTask({
          title: task.title,
          notes: notesLines.join('\n'),
          dueDate: task.dueDate,
        })
          .then((googleTaskId) => {
            if (googleTaskId) void taskRepo.setGoogleTaskId(task.id, googleTaskId);
          })
          .catch(() => {
            /* non-fatal */
          });
      }
    },
    onMutate: async (task: Task) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'confirmation'] });
      const previous = queryClient.getQueryData<Task[]>(['tasks', 'confirmation']);
      queryClient.setQueryData<Task[]>(
        ['tasks', 'confirmation'],
        (old) => old?.filter((t) => t.id !== task.id) ?? []
      );
      return { previous };
    },
    onError: (_err, _task, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks', 'confirmation'], context.previous);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (task: Task) => {
      await discardedRepo.insert({
        notificationId: task.id,
        notificationKey: task.notificationKey,
        sourceApp: task.sourceApp,
        sender: task.sender ?? null,
        bodyPreview: task.body ?? task.title,
        reason: 'USER_REJECTED',
        confidence: task.confidence,
        createdAt: Date.now(),
      });
      const senderKey = buildSenderKey(task.sourceApp, task.sender ?? '');
      await senderStatsRepo.incrementReject(senderKey);
      await taskRepo.deleteTask(task.id);
    },
    onMutate: async (task: Task) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'confirmation'] });
      const previous = queryClient.getQueryData<Task[]>(['tasks', 'confirmation']);
      queryClient.setQueryData<Task[]>(
        ['tasks', 'confirmation'],
        (old) => old?.filter((t) => t.id !== task.id) ?? []
      );
      return { previous };
    },
    onError: (_err, _task, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks', 'confirmation'], context.previous);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['discarded-log'] });
    },
  });

  const subtitle =
    tasks.length === 0 ? 'Nothing waiting' : `${tasks.length} waiting for your input`;

  return (
    <SwipeNavigator tabIndex={1}>
      <Screen>
        <LargeHeader title="Review" subtitle={subtitle} />

        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <ConfirmationCard
              task={item}
              onConfirm={(t) => confirmMutation.mutate(t)}
              onReject={(t) => rejectMutation.mutate(t)}
            />
          )}
          contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                title="Nothing to review"
                description="Notifications that need a second look land here. High-confidence tasks are added for you automatically."
              />
            )
          }
        />
      </Screen>
    </SwipeNavigator>
  );
}

function ConfirmationCard({
  task,
  onConfirm,
  onReject,
}: {
  task: Task;
  onConfirm: (task: Task) => void;
  onReject: (task: Task) => void;
}): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(task.priority);
  const confidencePct = Math.round(task.confidence * 100);
  const sourceLabel = task.sourceApp.split('.').pop() ?? task.sourceApp;

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <View style={styles.cardMeta}>
        <View style={styles.metaLeft}>
          <View style={[styles.dot, { backgroundColor: priorityColor }]} />
          <Text style={[styles.sourceMeta, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
            {task.sender ? `${task.sender} · ` : ''}
            {sourceLabel}
          </Text>
        </View>
        <Text style={[styles.confidence, { color: theme.onSurfaceVariant }]}>{confidencePct}%</Text>
      </View>

      <Text style={[styles.taskTitle, { color: theme.onSurface }]}>{task.title}</Text>

      {task.body != null && task.body !== task.title && (
        <Text style={[styles.taskBody, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
          {task.body}
        </Text>
      )}

      <View style={styles.buttonRow}>
        <Pressable
          onPress={() => onConfirm(task)}
          style={({ pressed }) => [styles.confirmBtn, pressed && { opacity: 0.8 }]}
          accessibilityRole="button"
          accessibilityLabel="Add as task"
        >
          <Text style={styles.confirmBtnText}>Add task</Text>
        </Pressable>
        <Pressable
          onPress={() => onReject(task)}
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
  list: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 12 },
  emptyContainer: { flexGrow: 1 },

  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 16,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  metaLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  sourceMeta: { fontSize: 13, flex: 1 },
  confidence: { fontSize: 13, fontWeight: '600', marginLeft: 8 },
  taskTitle: { fontSize: 16, fontWeight: '600', lineHeight: 23, marginBottom: 4 },
  taskBody: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
  buttonRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.primary500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: { color: Colors.white, fontSize: 14, fontWeight: '600' },
  rejectBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rejectBtnText: { fontSize: 14, fontWeight: '600' },
});
