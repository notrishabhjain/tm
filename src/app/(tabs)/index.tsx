import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  RefreshControl,
  TextInput,
  Pressable,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { TaskCard } from '@/ui/components/TaskCard';
import { EmptyState } from '@/ui/components/EmptyState';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import type { Task, Priority } from '@/domain/types';
import { useTaskStore } from '@/state/taskStore';

const taskRepo = new TaskRepository(db);
const DEPTH = 4;
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

interface Section {
  title: string;
  count: number;
  data: Task[];
}

function groupTasks(tasks: Task[]): Section[] {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTodayMs = startOfToday.getTime();
  const startOfWeekMs = startOfTodayMs - 6 * 24 * 60 * 60 * 1000;

  const today: Task[] = [];
  const thisWeek: Task[] = [];
  const older: Task[] = [];

  for (const t of tasks) {
    if (t.createdAt >= startOfTodayMs) today.push(t);
    else if (t.createdAt >= startOfWeekMs) thisWeek.push(t);
    else older.push(t);
  }

  const sections: Section[] = [];
  if (today.length > 0) sections.push({ title: 'TODAY', count: today.length, data: today });
  if (thisWeek.length > 0)
    sections.push({ title: 'THIS WEEK', count: thisWeek.length, data: thisWeek });
  if (older.length > 0) sections.push({ title: 'OLDER', count: older.length, data: older });
  return sections;
}

export default function HomeScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeFilter, setActiveFilter } = useTaskStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const theme = useTheme();

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
      if (context?.previous) queryClient.setQueryData(['tasks', 'pending'], context.previous);
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
      if (context?.previous) queryClient.setQueryData(['tasks', 'pending'], context.previous);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks'] }),
  });

  const filtered = useMemo(() => {
    let result = tasks.filter((t) => activeFilter === 'ALL' || t.priority === activeFilter);
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.sender ?? '').toLowerCase().includes(q) ||
          t.sourceApp.toLowerCase().includes(q)
      );
    }
    return result.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  }, [tasks, activeFilter, searchQuery]);

  const sections = useMemo(() => groupTasks(filtered), [filtered]);
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

  const toggleSearch = (): void => {
    setSearchVisible((v) => !v);
    if (searchVisible) setSearchQuery('');
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* Stats strip — CRED bold numeric display */}
      <View style={styles.statsStrip}>
        <StatItem label="PENDING" value={tasks.length} />
        <View style={styles.statDivider} />
        <StatItem label="URGENT" value={urgentCount} valueColor={Colors.urgentFg} />
        <View style={styles.statDivider} />
        <StatItem label="DONE TODAY" value={todayCount} valueColor={Colors.success} />

        {/* Search icon */}
        <Pressable onPress={toggleSearch} style={styles.searchToggle} accessibilityRole="button">
          <Text style={styles.searchIcon}>{searchVisible ? '✕' : '⌕'}</Text>
        </Pressable>
      </View>

      {/* Search bar */}
      {searchVisible && (
        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search tasks, senders, apps…"
            placeholderTextColor={theme.onSurfaceVariant}
            autoFocus
            returnKeyType="search"
          />
        </View>
      )}

      {/* Filter chips */}
      <View
        style={[
          styles.filterRow,
          { backgroundColor: theme.surface, borderBottomColor: theme.outline },
        ]}
      >
        {FILTERS.map((f) => (
          <FilterChip
            key={f.value}
            label={f.label}
            active={activeFilter === f.value}
            onPress={() => setActiveFilter(f.value)}
            outlineColor={theme.outline}
            textColor={theme.onSurfaceVariant}
          />
        ))}
      </View>

      {/* Task list with sections */}
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <TaskCard
            task={item}
            onPress={handlePress}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />
        )}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={styles.sectionBadge}>
              <Text style={styles.sectionCount}>{section.count}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          isLoading ? null : (
            <EmptyState
              title={searchQuery ? 'No results' : 'All clear'}
              description={
                searchQuery
                  ? 'No tasks match your search.'
                  : 'No pending tasks. Notifications from your monitored apps will appear here automatically.'
              }
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
        stickySectionHeadersEnabled={false}
      />

      {/* FAB — create task manually */}
      <View style={[styles.fabWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
        <View style={styles.fabShadow} />
        <Pressable
          style={({ pressed }) => [
            styles.fab,
            pressed && { transform: [{ translateX: DEPTH }, { translateY: DEPTH }] },
          ]}
          onPress={() => router.push('/task/create')}
          accessibilityRole="button"
          accessibilityLabel="Create new task"
        >
          <Text style={styles.fabIcon}>+</Text>
        </Pressable>
      </View>

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
  outlineColor,
  textColor,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  outlineColor: string;
  textColor: string;
}): React.JSX.Element {
  return (
    <Pressable
      style={[styles.filterChip, { borderColor: outlineColor }, active && styles.filterChipActive]}
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
    >
      <Text
        style={[styles.filterChipText, { color: textColor }, active && styles.filterChipTextActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  statsStrip: {
    flexDirection: 'row',
    backgroundColor: Colors.primary900,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
    alignItems: 'center',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statDivider: { width: 1, height: 36, backgroundColor: 'rgba(255,255,255,0.15)' },
  statValue: { fontSize: 36, fontWeight: '800', color: Colors.white, lineHeight: 42 },
  statLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.55)',
    marginTop: 1,
    fontWeight: '700',
    letterSpacing: 1.0,
  },
  searchToggle: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  searchIcon: { fontSize: 22, color: 'rgba(255,255,255,0.7)' },
  searchBar: {
    backgroundColor: Colors.primary900,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
  },
  searchInput: {
    height: 42,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    paddingHorizontal: 14,
    color: Colors.white,
    fontSize: 14,
    fontWeight: '500',
  },
  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    borderBottomWidth: 2,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 2,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipActive: { backgroundColor: Colors.primary900, borderColor: Colors.primary900 },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  filterChipTextActive: { color: Colors.white },
  list: { paddingTop: 4, paddingBottom: 100 },
  emptyContainer: { flex: 1 },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 6,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary900,
    letterSpacing: 1.2,
  },
  sectionBadge: {
    backgroundColor: Colors.primary900,
    borderRadius: 2,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sectionCount: { fontSize: 10, fontWeight: '800', color: Colors.white },
  fabWrapper: {
    position: 'absolute',
    bottom: 24,
    right: 20,
  },
  fabShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  fab: {
    width: 56,
    height: 56,
    backgroundColor: Colors.primary900,
    borderWidth: 2,
    borderColor: Colors.black,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabIcon: { fontSize: 28, color: Colors.white, fontWeight: '300', lineHeight: 34 },
  debugBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: Colors.urgentFg,
    borderRadius: 2,
    borderWidth: 1.5,
    borderColor: Colors.neoShadowUrgent,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  debugText: { color: Colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
});
