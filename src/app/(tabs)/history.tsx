import React, { useState, useMemo } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable } from 'react-native';
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
const DEPTH = 4;

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
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {/* Filter strip */}
        <View style={styles.filterRow}>
          {(Object.keys(FILTER_LABELS) as FilterPeriod[]).map((f) => (
            <Pressable
              key={f}
              style={[styles.chip, filter === f && styles.chipActive]}
              onPress={() => setFilter(f)}
            >
              <Text
                style={[
                  styles.chipText,
                  filter === f && styles.chipTextActive,
                  filter === f && { color: theme.primary },
                ]}
              >
                {FILTER_LABELS[f]}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Stats card */}
        {tasks.length > 0 && (
          <View style={[styles.statsWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
            <View style={styles.statsShadow} />
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
                        {p.charAt(0) + p.slice(1).toLowerCase()} {priorityBreakdown[p]}
                      </Text>
                    </View>
                  ))}
              </View>
            </View>
          </View>
        )}

        <FlatList
          data={tasks}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <HistoryTaskRow
              task={item}
              surfaceColor={theme.surface}
              onSurfaceVariantColor={theme.onSurfaceVariant}
            />
          )}
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
    </SwipeNavigator>
  );
}

function HistoryTaskRow({
  task,
  surfaceColor,
  onSurfaceVariantColor,
}: {
  task: Task;
  surfaceColor: string;
  onSurfaceVariantColor: string;
}): React.JSX.Element {
  const priorityColor = getPriorityColor(task.priority);

  return (
    <View style={[styles.rowWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
      <View style={[styles.rowShadow, { backgroundColor: priorityColor + '55' }]} />
      <View style={[styles.row, { borderColor: priorityColor, backgroundColor: surfaceColor }]}>
        <View style={[styles.priorityBar, { backgroundColor: priorityColor }]} />
        <View style={styles.rowContent}>
          <Text style={[styles.taskTitle, { color: onSurfaceVariantColor }]} numberOfLines={1}>
            {task.title}
          </Text>
          <Text style={[styles.rowMeta, { color: onSurfaceVariantColor }]}>
            {task.completedAt ? formatDate(task.completedAt) : 'Unknown'} ·{' '}
            {task.sourceApp.split('.').pop()}
          </Text>
        </View>
        <View style={styles.doneBadge}>
          <Text style={styles.doneText}>DONE</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.primary900,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  chipActive: {
    backgroundColor: Colors.white,
    borderColor: Colors.white,
  },
  chipText: { fontSize: 12, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  chipTextActive: {},
  statsWrapper: {
    marginHorizontal: 16,
    marginTop: 12,
    position: 'relative',
  },
  statsShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  statsCard: {
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    padding: 14,
  },
  statsTotal: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  breakdownRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  breakdownItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  breakdownDot: { width: 8, height: 8, borderRadius: 2 },
  breakdownLabel: { fontSize: 12, fontWeight: '500' },
  list: { paddingTop: 8, paddingBottom: 16 },
  emptyContainer: { flex: 1 },
  rowWrapper: { marginHorizontal: 16, marginVertical: 4, position: 'relative' },
  rowShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  priorityBar: { width: 4, alignSelf: 'stretch' },
  rowContent: { flex: 1, paddingHorizontal: 12, paddingVertical: 10 },
  taskTitle: {
    fontSize: 14,
    fontWeight: '600',
    textDecorationLine: 'line-through',
    marginBottom: 2,
  },
  rowMeta: { fontSize: 11 },
  doneBadge: {
    marginRight: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: Colors.success,
    backgroundColor: Colors.successBg,
  },
  doneText: { fontSize: 10, fontWeight: '800', color: Colors.success, letterSpacing: 0.5 },
});
