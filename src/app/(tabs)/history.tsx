import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, SafeAreaView } from 'react-native';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';
import { useQuery } from '@tanstack/react-query';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
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
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View
            style={[
              styles.header,
              { backgroundColor: theme.surface, borderBottomColor: theme.outline },
            ]}
          >
            <Text style={[styles.headerTitle, { color: theme.onSurface }]}>History</Text>

            {/* Filter chips inline */}
            <View style={styles.filterRow}>
              {(Object.keys(FILTER_LABELS) as FilterPeriod[]).map((f) => (
                <Pressable
                  key={f}
                  style={[styles.filterChip, filter === f && styles.filterChipActive]}
                  onPress={() => setFilter(f)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: filter === f }}
                >
                  <Text
                    style={[
                      styles.filterChipText,
                      { color: theme.onSurfaceVariant },
                      filter === f && styles.filterChipTextActive,
                    ]}
                  >
                    {FILTER_LABELS[f]}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Stats summary */}
          {tasks.length > 0 && (
            <View style={[styles.statsCard, { backgroundColor: theme.surface }]}>
              <Text style={[styles.statsTotal, { color: theme.onSurface }]}>
                {tasks.length} task{tasks.length !== 1 ? 's' : ''} completed
              </Text>
              <View style={styles.breakdownRow}>
                {(Object.keys(priorityBreakdown) as Priority[])
                  .filter((p) => priorityBreakdown[p] > 0)
                  .map((p) => (
                    <View key={p} style={styles.breakdownItem}>
                      <View
                        style={[styles.breakdownDot, { backgroundColor: getPriorityColor(p) }]}
                      />
                      <Text style={[styles.breakdownLabel, { color: theme.onSurfaceVariant }]}>
                        {p.charAt(0) + p.slice(1).toLowerCase()} · {priorityBreakdown[p]}
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
                      ? 'Completed tasks will appear here.'
                      : 'Try selecting a wider time range.'
                  }
                />
              )
            }
          />
        </View>
      </SafeAreaView>
    </SwipeNavigator>
  );
}

function HistoryTaskRow({ task }: { task: Task }): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(task.priority);
  const sourceLabel = task.sourceApp.split('.').pop() ?? task.sourceApp;

  return (
    <View style={[styles.row, { backgroundColor: theme.surface }]}>
      <View style={[styles.rowAccent, { backgroundColor: priorityColor }]} />
      <View style={styles.rowContent}>
        <Text style={[styles.rowTitle, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
          {task.title}
        </Text>
        <Text style={[styles.rowMeta, { color: theme.onSurfaceVariant }]}>
          {task.completedAt ? formatDate(task.completedAt) : 'Unknown'} · {sourceLabel}
        </Text>
      </View>
      <View
        style={[
          styles.donePill,
          { borderColor: Colors.success + '60', backgroundColor: Colors.successBg },
        ]}
      >
        <Text style={styles.doneText}>✓ Done</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },

  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 15,
  },
  filterChipActive: {
    backgroundColor: Colors.primary900,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: '500',
  },
  filterChipTextActive: {
    color: Colors.white,
    fontWeight: '600',
  },

  statsCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 12,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  statsTotal: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
  },
  breakdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownDot: { width: 8, height: 8, borderRadius: 4 },
  breakdownLabel: { fontSize: 12, fontWeight: '500' },

  list: { paddingTop: 8, paddingBottom: 24 },
  emptyContainer: { flex: 1 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  rowAccent: { width: 4, alignSelf: 'stretch' },
  rowContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  rowTitle: {
    fontSize: 14,
    fontWeight: '500',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  rowMeta: { fontSize: 11, fontWeight: '400' },
  donePill: {
    marginRight: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  doneText: { fontSize: 11, fontWeight: '600', color: Colors.success },
});
