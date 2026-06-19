import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';
import { useQuery } from '@tanstack/react-query';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { EmptyState } from '@/ui/components/EmptyState';
import { Screen, LargeHeader } from '@/ui/components/Screen';
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
  const theme = useTheme();

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

  return (
    <SwipeNavigator tabIndex={2}>
      <Screen>
        <LargeHeader
          title="History"
          subtitle={tasks.length > 0 ? `${tasks.length} completed` : undefined}
        />

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {(Object.keys(FILTER_LABELS) as FilterPeriod[]).map((f) => {
            const active = filter === f;
            return (
              <Pressable
                key={f}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? Colors.primary500 : theme.surfaceVariant },
                ]}
                onPress={() => setFilter(f)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? Colors.white : theme.onSurfaceVariant },
                  ]}
                >
                  {FILTER_LABELS[f]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Breakdown */}
        {tasks.length > 0 && (
          <View style={styles.breakdownRow}>
            {(Object.keys(priorityBreakdown) as Priority[])
              .filter((p) => priorityBreakdown[p] > 0)
              .map((p) => (
                <View key={p} style={styles.breakdownItem}>
                  <View style={[styles.breakdownDot, { backgroundColor: getPriorityColor(p) }]} />
                  <Text style={[styles.breakdownLabel, { color: theme.onSurfaceVariant }]}>
                    {p.charAt(0) + p.slice(1).toLowerCase()} {priorityBreakdown[p]}
                  </Text>
                </View>
              ))}
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
                    ? 'Completed tasks will appear here.'
                    : 'Try selecting a wider time range.'
                }
              />
            )
          }
        />
      </Screen>
    </SwipeNavigator>
  );
}

function HistoryTaskRow({ task }: { task: Task }): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(task.priority);
  const sourceLabel = task.sourceApp.split('.').pop() ?? task.sourceApp;

  return (
    <View style={[styles.row, { borderBottomColor: theme.outline }]}>
      <View style={[styles.check, { borderColor: Colors.success }]}>
        <Text style={styles.checkMark}>✓</Text>
      </View>
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.onSurfaceVariant }]}>
          {task.completedAt ? formatDate(task.completedAt) : 'Unknown'} · {sourceLabel}
        </Text>
      </View>
      <View style={[styles.dot, { backgroundColor: priorityColor }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  filterRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },

  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { fontSize: 13, fontWeight: '500' },

  list: { paddingBottom: 24 },
  emptyContainer: { flexGrow: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 0.5,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  checkMark: { color: Colors.success, fontSize: 12, fontWeight: '800' },
  rowContent: { flex: 1 },
  rowTitle: {
    fontSize: 15,
    fontWeight: '500',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  rowMeta: { fontSize: 12 },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 12 },
});
