import React from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { getPriorityColor } from '@/ui/theme/colors';
import { EmptyState } from '@/ui/components/EmptyState';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import type { Task } from '@/domain/types';

const taskRepo = new TaskRepository(db);

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export default function HistoryScreen(): React.JSX.Element {
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'completed'],
    queryFn: () => taskRepo.getCompletedTasks(),
    refetchInterval: 30000,
  });

  return (
    <View style={styles.container}>
      {tasks.length > 0 && (
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Completed Tasks</Text>
          <Text style={styles.statsCount}>{tasks.length} total</Text>
        </View>
      )}

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <HistoryTaskRow task={item} />}
        contentContainerStyle={tasks.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title="No history yet"
              description="Completed tasks will appear here. Complete tasks by swiping right on the home screen."
            />
          )
        }
      />
    </View>
  );
}

function HistoryTaskRow({ task }: { task: Task }): React.JSX.Element {
  const priorityColor = getPriorityColor(task.priority);

  return (
    <View style={styles.row}>
      <View style={[styles.priorityDot, { backgroundColor: priorityColor }]} />
      <View style={styles.rowContent}>
        <Text style={styles.taskTitle} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={styles.rowMeta}>
          {task.completedAt ? formatDate(task.completedAt) : 'Unknown'} ·{' '}
          {task.sourceApp.split('.').pop()}
        </Text>
      </View>
      <View style={styles.doneBadge}>
        <Text style={styles.doneText}>✓</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  statsCard: {
    margin: 16,
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    elevation: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurfaceLight,
  },
  statsCount: {
    fontSize: 14,
    color: Colors.onSurfaceVariantLight,
  },
  list: {
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    marginHorizontal: 16,
    marginVertical: 3,
    borderRadius: 8,
    padding: 12,
    gap: 12,
  },
  priorityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  rowContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: Colors.onSurfaceVariantLight,
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  rowMeta: {
    fontSize: 11,
    color: Colors.onSurfaceVariantLight,
  },
  doneBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.successBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneText: {
    fontSize: 14,
    color: Colors.success,
    fontWeight: '700',
  },
});
