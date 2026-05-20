import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { getPriorityColor } from '@/ui/theme/colors';
import { EmptyState } from '@/ui/components/EmptyState';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import type { Task, Priority } from '@/domain/types';

const taskRepo = new TaskRepository(db);

type FilterPeriod = 'TODAY' | 'WEEK' | 'ALL';

const FILTER_LABELS: Record<FilterPeriod, string> = {
  TODAY: 'Today',
  WEEK: 'This Week',
  ALL: 'All Time',
};

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function startOfDay(date: Date): number {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export default function HistoryScreen(): React.JSX.Element {
  const [filter, setFilter] = useState<FilterPeriod>('ALL');

  const { data: allTasks = [], isLoading } = useQuery({
    queryKey: ['tasks', 'completed'],
    queryFn: () => taskRepo.getCompletedTasks(),
    refetchInterval: 30000,
  });

  const tasks = useMemo(() => {
    if (filter === 'ALL') return allTasks;
    const now = Date.now();
    if (filter === 'TODAY') {
      const dayStart = startOfDay(new Date(now));
      return allTasks.filter((t) => (t.completedAt ?? 0) >= dayStart);
    }
    const weekStart = now - 7 * 24 * 60 * 60 * 1000;
    return allTasks.filter((t) => (t.completedAt ?? 0) >= weekStart);
  }, [allTasks, filter]);

  const priorityBreakdown = useMemo(() => {
    const counts: Record<Priority, number> = { URGENT: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
    for (const t of tasks) counts[t.priority]++;
    return counts;
  }, [tasks]);

  const hasPriorityData = tasks.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.filterRow}>
        {(Object.keys(FILTER_LABELS) as FilterPeriod[]).map((f) => (
          <Pressable
            key={f}
            style={[styles.chip, filter === f && styles.chipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {FILTER_LABELS[f]}
            </Text>
          </Pressable>
        ))}
      </View>

      {hasPriorityData && (
        <View style={styles.statsCard}>
          <View style={styles.statsRow}>
            <Text style={styles.statsTotal}>{tasks.length} completed</Text>
          </View>
          <View style={styles.breakdownRow}>
            {(Object.keys(priorityBreakdown) as Priority[])
              .filter((p) => priorityBreakdown[p] > 0)
              .map((p) => (
                <View key={p} style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: getPriorityColor(p) }]} />
                  <Text style={styles.breakdownLabel}>
                    {p.charAt(0) + p.slice(1).toLowerCase()} {priorityBreakdown[p]}
                  </Text>
                </View>
              ))}
          </View>
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
              title={filter === 'ALL' ? 'No history yet' : 'Nothing in this period'}
              description={
                filter === 'ALL'
                  ? 'Completed tasks will appear here. Complete tasks by swiping right on the home screen.'
                  : 'Try selecting a wider time range.'
              }
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
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surfaceVariantLight,
    borderWidth: 1,
    borderColor: Colors.outlineLight,
  },
  chipActive: {
    backgroundColor: Colors.primary500,
    borderColor: Colors.primary500,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '500',
    color: Colors.onSurfaceVariantLight,
  },
  chipTextActive: {
    color: Colors.white,
  },
  statsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    elevation: 1,
  },
  statsRow: {
    marginBottom: 8,
  },
  statsTotal: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.onSurfaceLight,
  },
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  breakdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
  },
  list: {
    paddingBottom: 16,
    paddingTop: 4,
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
