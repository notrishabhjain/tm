import React from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { getPriorityColor } from '@/ui/theme/colors';
import { EmptyState } from '@/ui/components/EmptyState';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { SenderStatsRepository } from '@/data/repositories/SenderStatsRepository';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { LearnedKeywordRepository } from '@/data/repositories/LearnedKeywordRepository';
import { db } from '@/data/db/client';
import { extractNgrams, languageForText } from '@/services/ngram-extractor';
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
      const senderKey = task.sender ?? task.sourceApp;
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const rejectMutation = useMutation({
    mutationFn: async (task: Task) => {
      await discardedRepo.insert({
        notificationId: task.id,
        sourceApp: task.sourceApp,
        sender: task.sender ?? null,
        bodyPreview: task.body ?? task.title,
        reason: 'USER_REJECTED',
        confidence: task.confidence,
        createdAt: Date.now(),
      });
      const senderKey = task.sender ?? task.sourceApp;
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
    <View style={styles.container}>
      {tasks.length > 0 && (
        <View style={styles.header}>
          <Text style={styles.headerText}>
            {tasks.length} notification{tasks.length !== 1 ? 's' : ''} need your input
          </Text>
        </View>
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
              title="Nothing to confirm"
              description="Notifications that need your input will appear here. High-confidence tasks are added automatically."
            />
          )
        }
      />
    </View>
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
  const priorityColor = getPriorityColor(task.priority);
  const DEPTH = 4;

  return (
    <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
      <View style={[styles.cardShadow, { backgroundColor: priorityColor }]} />
      <View style={[styles.card, { borderColor: priorityColor }]}>
        <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />
        <View style={styles.cardContent}>
          <Text style={styles.taskText}>{task.title}</Text>
          {task.body != null && task.body !== task.title && (
            <Text style={styles.taskBody} numberOfLines={3}>
              {task.body}
            </Text>
          )}
          <View style={styles.metaRow}>
            <Text style={styles.sourceMeta}>
              {task.sender ? `${task.sender} · ` : ''}
              {task.sourceApp.split('.').pop() ?? task.sourceApp}
            </Text>
            <Text style={styles.confidence}>{Math.round(task.confidence * 100)}% conf</Text>
          </View>
          <View style={styles.buttonRow}>
            <NeoButton
              label="Add task"
              onPress={() => onConfirm(task)}
              bgColor={Colors.primary900}
              shadowColor={Colors.black}
              textColor={Colors.white}
              style={styles.confirmButton}
            />
            <NeoButton
              label="Skip"
              onPress={() => onReject(task)}
              bgColor={Colors.urgentFg}
              shadowColor="#8B1C1C"
              textColor={Colors.white}
              style={styles.rejectButton}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

function NeoButton({
  label,
  onPress,
  bgColor,
  shadowColor,
  textColor,
  style,
}: {
  label: string;
  onPress: () => void;
  bgColor: string;
  shadowColor: string;
  textColor: string;
  style?: object;
}): React.JSX.Element {
  const DEPTH = 3;
  return (
    <View style={[styles.neoButtonWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }, style]}>
      <View style={[styles.neoButtonShadow, { backgroundColor: shadowColor }]} />
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.neoButton,
          { backgroundColor: bgColor, borderColor: shadowColor },
          pressed && { transform: [{ translateX: DEPTH }, { translateY: DEPTH }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
      >
        <Text style={[styles.neoButtonText, { color: textColor }]}>{label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.primary900,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
  },
  headerText: {
    fontSize: 13,
    color: Colors.white,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  list: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
  },
  cardWrapper: {
    marginHorizontal: 16,
    marginVertical: 6,
    position: 'relative',
  },
  cardShadow: {
    position: 'absolute',
    top: 4,
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
  },
  cardContent: {
    flex: 1,
    padding: 14,
  },
  taskText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.onSurfaceLight,
    lineHeight: 21,
    marginBottom: 4,
  },
  taskBody: {
    fontSize: 13,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 19,
    marginBottom: 8,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sourceMeta: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
  },
  confidence: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    fontStyle: 'italic',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmButton: {
    flex: 1,
  },
  rejectButton: {
    flex: 1,
  },
  neoButtonWrapper: {
    position: 'relative',
  },
  neoButtonShadow: {
    position: 'absolute',
    top: 3,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  neoButton: {
    height: 40,
    borderWidth: 2,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  neoButtonText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
