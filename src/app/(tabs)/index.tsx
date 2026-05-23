import React, { useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { TaskCard } from '@/ui/components/TaskCard';
import { EmptyState } from '@/ui/components/EmptyState';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import type { Task, Priority } from '@/domain/types';
import { useTaskStore } from '@/state/taskStore';

const taskRepo = new TaskRepository(db);
const PRIORITY_ORDER: Record<Priority, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const FILTERS: Array<{ label: string; value: 'ALL' | Priority }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Urgent', value: 'URGENT' },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

export default function HomeScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeFilter, setActiveFilter } = useTaskStore();

  const {
    data: tasks = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['tasks', 'pending'],
    queryFn: () => taskRepo.getPendingTasks(),
    refetchInterval: 10000,
  });

  const { data: todayCount = 0 } = useQuery({
    queryKey: ['tasks', 'today-completed'],
    queryFn: () => taskRepo.getTodayCompletedCount(),
    refetchInterval: 10000,
  });

  const completeMutation = useMutation({
    mutationFn: (id: string) => taskRepo.completeTask(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'pending'] });
      const previous = queryClient.getQueryData<Task[]>(['tasks', 'pending']);
      queryClient.setQueryData<Task[]>(
        ['tasks', 'pending'],
        (old) => old?.filter((t) => t.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks', 'pending'], context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => taskRepo.deleteTask(id),
    onMutate: async (id: string) => {
      await queryClient.cancelQueries({ queryKey: ['tasks', 'pending'] });
      const previous = queryClient.getQueryData<Task[]>(['tasks', 'pending']);
      queryClient.setQueryData<Task[]>(
        ['tasks', 'pending'],
        (old) => old?.filter((t) => t.id !== id) ?? []
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['tasks', 'pending'], context.previous);
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const filteredTasks = tasks
    .filter((t) => activeFilter === 'ALL' || t.priority === activeFilter)
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);

  const urgentCount = tasks.filter((t) => t.priority === 'URGENT').length;

  const handlePress = useCallback((task: Task) => router.push(`/task/${task.id}`), [router]);
  const handleComplete = useCallback(
    (task: Task) => completeMutation.mutate(task.id),
    [completeMutation]
  );
  const handleDelete = useCallback(
    (task: Task) => deleteMutation.mutate(task.id),
    [deleteMutation]
  );

  return (
    <View style={styles.container}>
      {/* Stats strip — NeoPop dark band */}
      <View style={styles.statsStrip}>
        <StatItem label="PENDING" value={tasks.length} />
        <View style={styles.statDivider} />
        <StatItem label="URGENT" value={urgentCount} valueColor={Colors.urgentFg} />
        <View style={styles.statDivider} />
        <StatItem label="DONE TODAY" value={todayCount} valueColor={Colors.success} />
      </View>

      {/* Filter chips */}
      <View style={styles.filterRow}>
        {FILTERS.map((f) => (
          <FilterChip
            key={f.value}
            label={f.label}
            active={activeFilter === f.value}
            onPress={() => setActiveFilter(f.value)}
          />
        ))}
      </View>

      {/* Task list */}
      <FlatList
        data={filteredTasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={handlePress}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />
        )}
        contentContainerStyle={filteredTasks.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title="All clear"
              description="No pending tasks. Notifications from your monitored apps will appear here automatically."
            />
          )
        }
        refreshControl={
          <RefreshControl
            refreshing={isLoading}
            onRefresh={() => void refetch()}
            tintColor={Colors.primary500}
          />
        }
      />

      {/* DEBUG watermark */}
      {__DEV__ && (
        <View style={styles.debugBadge} pointerEvents="none">
          <Text style={styles.debugText}>DEBUG</Text>
        </View>
      )}
    </View>
  );
}

function StatItem({
  label,
  value,
  valueColor = Colors.white,
}: {
  label: string;
  value: number;
  valueColor?: string;
}): React.JSX.Element {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color: valueColor }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <View style={[styles.filterChip, active && styles.filterChipActive]}>
      <Text
        style={[styles.filterChipText, active && styles.filterChipTextActive]}
        onPress={onPress}
      >
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.primary900,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
    alignItems: 'center',
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  statValue: {
    fontSize: 24,
    fontWeight: '800',
    color: Colors.white,
  },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.65)',
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.8,
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 2,
    borderBottomColor: Colors.outlineLight,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: Colors.onSurfaceVariantLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: {
    backgroundColor: Colors.primary900,
    borderColor: Colors.primary900,
  },
  filterChipText: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  filterChipTextActive: {
    color: Colors.white,
  },
  list: {
    paddingTop: 8,
    paddingBottom: 16,
  },
  emptyContainer: {
    flex: 1,
  },
  debugBadge: {
    position: 'absolute',
    bottom: 16,
    right: 16,
    backgroundColor: Colors.urgentFg,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: Colors.neoShadowUrgent,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  debugText: {
    color: Colors.white,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
});
