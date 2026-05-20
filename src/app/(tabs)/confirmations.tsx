import React from 'react';
import { View, Text, FlatList, StyleSheet, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { getPriorityColor } from '@/ui/theme/colors';
import { EmptyState } from '@/ui/components/EmptyState';
import { Button } from '@/ui/components/Button';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { SenderStatsRepository } from '@/data/repositories/SenderStatsRepository';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { db } from '@/data/db/client';
import type { Task } from '@/domain/types';

const taskRepo = new TaskRepository(db);
const senderStatsRepo = new SenderStatsRepository(db);
const discardedRepo = new DiscardedLogRepository(db);

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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      void queryClient.invalidateQueries({ queryKey: ['discarded-log'] });
    },
  });

  const handleConfirm = (task: Task): void => {
    confirmMutation.mutate(task);
  };

  const handleReject = (task: Task): void => {
    Alert.alert('Skip this task?', 'This notification will be moved to discarded history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Skip',
        style: 'destructive',
        onPress: () => rejectMutation.mutate(task),
      },
    ]);
  };

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
          <ConfirmationCard task={item} onConfirm={handleConfirm} onReject={handleReject} />
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

  return (
    <View style={styles.card}>
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
          <Text style={styles.confidence}>{Math.round(task.confidence * 100)}% confident</Text>
        </View>
        <View style={styles.buttonRow}>
          <Button
            label="Yes, add task"
            variant="primary"
            onPress={() => onConfirm(task)}
            style={styles.confirmButton}
          />
          <Button
            label="No, skip"
            variant="destructive"
            onPress={() => onReject(task)}
            style={styles.rejectButton}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  header: {
    padding: 16,
    backgroundColor: Colors.surfaceVariantLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  headerText: {
    fontSize: 13,
    color: Colors.onSurfaceVariantLight,
    fontWeight: '500',
  },
  list: {
    paddingVertical: 8,
  },
  emptyContainer: {
    flex: 1,
  },
  card: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 16,
    marginVertical: 6,
    borderRadius: 8,
    elevation: 2,
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
    fontWeight: '600',
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
    height: 40,
  },
  rejectButton: {
    flex: 1,
    height: 40,
  },
});
