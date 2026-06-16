import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { EmptyState } from '@/ui/components/EmptyState';
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
  const theme = useTheme();

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

  return (
    <SwipeNavigator tabIndex={1}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View
            style={[
              styles.header,
              { backgroundColor: theme.surface, borderBottomColor: theme.outline },
            ]}
          >
            <Text style={[styles.headerTitle, { color: theme.onSurface }]}>Review</Text>
            {tasks.length > 0 && (
              <View style={styles.countBadge}>
                <Text style={styles.countBadgeText}>{tasks.length}</Text>
              </View>
            )}
          </View>

          {tasks.length > 0 && (
            <Text style={[styles.subtitle, { color: theme.onSurfaceVariant }]}>
              {tasks.length} notification{tasks.length !== 1 ? 's' : ''} waiting for your input
            </Text>
          )}

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
                  description="Notifications that need your input will appear here. High-confidence tasks are added automatically."
                />
              )
            }
          />
        </View>
      </SafeAreaView>
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
    <View style={[styles.card, { backgroundColor: theme.surface }]}>
      {/* Priority accent */}
      <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />

      <View style={styles.cardContent}>
        {/* Source + confidence */}
        <View style={styles.cardMeta}>
          <Text style={[styles.sourceMeta, { color: theme.onSurfaceVariant }]}>
            {task.sender ? `${task.sender} · ` : ''}
            {sourceLabel}
          </Text>
          <View
            style={[
              styles.confidencePill,
              { borderColor: priorityColor + '40', backgroundColor: priorityColor + '12' },
            ]}
          >
            <Text style={[styles.confidenceText, { color: priorityColor }]}>{confidencePct}%</Text>
          </View>
        </View>

        {/* Title */}
        <Text style={[styles.taskTitle, { color: theme.onSurface }]}>{task.title}</Text>

        {/* Body preview */}
        {task.body != null && task.body !== task.title && (
          <Text style={[styles.taskBody, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
            {task.body}
          </Text>
        )}

        {/* Action buttons */}
        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => onConfirm(task)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.confirmBtn,
              pressed && { opacity: 0.82 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Add as task"
          >
            <Text style={styles.confirmBtnText}>Add task</Text>
          </Pressable>
          <Pressable
            onPress={() => onReject(task)}
            style={({ pressed }) => [
              styles.actionBtn,
              styles.rejectBtn,
              { borderColor: theme.outline },
              pressed && { opacity: 0.82 },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Skip notification"
          >
            <Text style={[styles.rejectBtnText, { color: theme.onSurfaceVariant }]}>Skip</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  countBadge: {
    backgroundColor: Colors.urgentFg,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
  },
  countBadgeText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 13,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },

  list: { paddingTop: 4, paddingBottom: 24 },
  emptyContainer: { flex: 1 },

  card: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 6,
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
  cardContent: {
    flex: 1,
    padding: 14,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  sourceMeta: {
    fontSize: 12,
    flex: 1,
  },
  confidencePill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    marginLeft: 8,
  },
  confidenceText: {
    fontSize: 11,
    fontWeight: '600',
  },
  taskTitle: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
    marginBottom: 6,
  },
  taskBody: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  actionBtn: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtn: {
    backgroundColor: Colors.primary900,
  },
  confirmBtnText: {
    color: Colors.white,
    fontSize: 13,
    fontWeight: '600',
  },
  rejectBtn: {
    borderWidth: 1.5,
    backgroundColor: 'transparent',
  },
  rejectBtnText: {
    fontSize: 13,
    fontWeight: '600',
  },
});
