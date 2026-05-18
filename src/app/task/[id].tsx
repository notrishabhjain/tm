import React from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { Button } from '@/ui/components/Button';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';

const taskRepo = new TaskRepository(db);

export default function TaskDetailScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: task, isLoading } = useQuery({
    queryKey: ['task', id],
    queryFn: () => taskRepo.getTaskById(id ?? ''),
    enabled: !!id,
  });

  const completeMutation = useMutation({
    mutationFn: () => taskRepo.completeTask(id ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.back();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => taskRepo.deleteTask(id ?? ''),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.back();
    },
  });

  const handleDelete = (): void => {
    Alert.alert('Delete Task', 'This task will be moved to history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteMutation.mutate(),
      },
    ]);
  };

  if (isLoading || !task) {
    return (
      <View style={styles.loading}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const priorityColor = getPriorityColor(task.priority);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: priorityColor }]}>
        <Pressable
          onPress={() => router.back()}
          style={styles.backButton}
          accessibilityRole="button"
        >
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <PriorityChip priority={task.priority} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
        {/* Task title */}
        <Text style={styles.taskTitle} selectable>
          {task.title}
        </Text>

        {/* Source info */}
        <View style={styles.sourceCard}>
          <InfoRow label="Source" value={task.sourceApp.split('.').pop() ?? task.sourceApp} />
          {task.sender && <InfoRow label="From" value={task.sender} />}
          <InfoRow label="Captured" value={new Date(task.createdAt).toLocaleString('en-IN')} />
          <InfoRow label="Confidence" value={`${Math.round(task.confidence * 100)}%`} />
        </View>

        {/* Body / original message */}
        {task.body && (
          <View style={styles.originalCard}>
            <Text style={styles.originalLabel}>Original message</Text>
            <Text style={styles.originalText} selectable>
              {task.body}
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Action bar */}
      <View style={styles.actionBar}>
        <Button
          label="Mark Complete"
          variant="primary"
          onPress={() => completeMutation.mutate()}
          loading={completeMutation.isPending}
          style={styles.completeButton}
        />
        <Button
          label="Delete"
          variant="destructive"
          onPress={handleDelete}
          loading={deleteMutation.isPending}
          style={styles.deleteButton}
        />
      </View>
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  loading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: Colors.onSurfaceVariantLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 3,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 16, color: Colors.primary500, fontWeight: '600' },
  body: { flex: 1 },
  bodyContent: { padding: 16, gap: 16 },
  taskTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.onSurfaceLight,
    lineHeight: 28,
  },
  sourceCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    padding: 12,
    elevation: 1,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  infoLabel: { fontSize: 13, color: Colors.onSurfaceVariantLight, fontWeight: '500' },
  infoValue: { fontSize: 13, color: Colors.onSurfaceLight, flex: 1, textAlign: 'right' },
  originalCard: {
    backgroundColor: Colors.surfaceVariantLight,
    borderRadius: 8,
    padding: 14,
  },
  originalLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  originalText: {
    fontSize: 13,
    color: Colors.onSurfaceLight,
    lineHeight: 20,
    fontFamily: 'JetBrainsMono-Regular',
  },
  actionBar: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineLight,
  },
  completeButton: { flex: 1 },
  deleteButton: { width: 100 },
});
