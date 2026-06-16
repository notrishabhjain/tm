import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  SectionList,
  StyleSheet,
  RefreshControl,
  TextInput,
  Pressable,
  Alert,
  ActivityIndicator,
  SafeAreaView,
} from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { TaskCard } from '@/ui/components/TaskCard';
import { EmptyState } from '@/ui/components/EmptyState';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import NotificationListener from '../../../modules/notification-listener/src';
import type { Task, Priority } from '@/domain/types';
import { useTaskStore } from '@/state/taskStore';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';

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
  if (today.length > 0) sections.push({ title: 'Today', count: today.length, data: today });
  if (thisWeek.length > 0)
    sections.push({ title: 'This Week', count: thisWeek.length, data: thisWeek });
  if (older.length > 0) sections.push({ title: 'Older', count: older.length, data: older });
  return sections;
}

export default function HomeScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { activeFilter, setActiveFilter } = useTaskStore();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchVisible, setSearchVisible] = useState(false);
  const [scanning, setScanning] = useState(false);
  const theme = useTheme();

  const mountedRef = useRef(true);
  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const {
    data: tasks = [],
    isLoading,
    isRefetching,
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
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
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
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

  const handleScan = async (): Promise<void> => {
    setScanning(true);
    try {
      await NotificationListener.scanActiveNotifications();
      await new Promise((r) => setTimeout(r, 1200));
      if (!mountedRef.current) return;
      await refetch();
    } catch {
      if (mountedRef.current) {
        Alert.alert(
          'Scan failed',
          'Could not scan notifications. Make sure the service is running.'
        );
      }
    } finally {
      if (mountedRef.current) setScanning(false);
    }
  };

  return (
    <SwipeNavigator tabIndex={0}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <View style={[styles.container, { backgroundColor: theme.background }]}>
          {/* Header */}
          <View
            style={[
              styles.header,
              { backgroundColor: theme.surface, borderBottomColor: theme.outline },
            ]}
          >
            <View style={styles.headerTop}>
              <Text style={[styles.appTitle, { color: theme.onSurface }]}>TaskMind</Text>
              <View style={styles.headerActions}>
                <Pressable
                  onPress={() => void handleScan()}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  accessibilityLabel="Scan notifications"
                  disabled={scanning}
                  hitSlop={8}
                >
                  {scanning ? (
                    <ActivityIndicator size="small" color={Colors.primary500} />
                  ) : (
                    <Text style={[styles.iconBtnText, { color: theme.onSurfaceVariant }]}>↺</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={toggleSearch}
                  style={styles.iconBtn}
                  accessibilityRole="button"
                  hitSlop={8}
                >
                  <Text style={[styles.iconBtnText, { color: theme.onSurfaceVariant }]}>
                    {searchVisible ? '✕' : '⌕'}
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <StatPill label="Pending" value={tasks.length} color={Colors.primary900} />
              <StatPill label="Urgent" value={urgentCount} color={Colors.urgentFg} />
              <StatPill label="Done today" value={todayCount} color={Colors.success} />
            </View>

            {/* Search bar */}
            {searchVisible && (
              <View style={[styles.searchBar, { borderTopColor: theme.outline }]}>
                <TextInput
                  style={[
                    styles.searchInput,
                    { color: theme.onSurface, borderColor: theme.outline },
                  ]}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Search tasks, senders, apps…"
                  placeholderTextColor={theme.onSurfaceVariant}
                  autoFocus
                  returnKeyType="search"
                />
              </View>
            )}
          </View>

          {/* Filter chips */}
          <View
            style={[
              styles.filterRow,
              { backgroundColor: theme.surface, borderBottomColor: theme.outline },
            ]}
          >
            {FILTERS.map((f) => (
              <Pressable
                key={f.value}
                style={[styles.filterChip, activeFilter === f.value && styles.filterChipActive]}
                onPress={() => setActiveFilter(f.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: activeFilter === f.value }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: theme.onSurfaceVariant },
                    activeFilter === f.value && styles.filterChipTextActive,
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Task list */}
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
                <Text style={[styles.sectionTitle, { color: theme.onSurfaceVariant }]}>
                  {section.title}
                </Text>
                <View style={[styles.sectionBadge, { backgroundColor: theme.surfaceVariant }]}>
                  <Text style={[styles.sectionCount, { color: theme.onSurfaceVariant }]}>
                    {section.count}
                  </Text>
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
                refreshing={isRefetching}
                onRefresh={() => void refetch()}
                tintColor={Colors.primary500}
              />
            }
            stickySectionHeadersEnabled={false}
          />

          {/* FAB */}
          <Pressable
            style={({ pressed }) => [
              styles.fab,
              pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
            ]}
            onPress={() => router.push('/task/create')}
            accessibilityRole="button"
            accessibilityLabel="Create new task"
          >
            <Text style={styles.fabIcon}>+</Text>
          </Pressable>

          {__DEV__ && (
            <View style={styles.debugBadge} pointerEvents="none">
              <Text style={styles.debugText}>DEV</Text>
            </View>
          )}
        </View>
      </SafeAreaView>
    </SwipeNavigator>
  );
}

function StatPill({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={[styles.statPill, { backgroundColor: theme.surfaceVariant }]}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.onSurfaceVariant }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },

  header: {
    borderBottomWidth: 1,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  appTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerActions: {
    flexDirection: 'row',
    gap: 4,
  },
  iconBtn: {
    width: 38,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconBtnText: {
    fontSize: 22,
  },

  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    gap: 8,
  },
  statPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  statValue: {
    fontSize: 26,
    fontWeight: '700',
    lineHeight: 32,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
    letterSpacing: 0.2,
  },

  searchBar: {
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    marginTop: 12,
  },
  searchInput: {
    height: 42,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 14,
    fontSize: 14,
  },

  filterRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 6,
    borderBottomWidth: 1,
  },
  filterChip: {
    height: 30,
    paddingHorizontal: 12,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
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

  list: { paddingTop: 8, paddingBottom: 100 },
  emptyContainer: { flex: 1 },

  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.4,
  },
  sectionBadge: {
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sectionCount: { fontSize: 11, fontWeight: '600' },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    backgroundColor: Colors.primary900,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabIcon: { fontSize: 28, color: Colors.white, fontWeight: '300', lineHeight: 34 },

  debugBadge: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    backgroundColor: Colors.urgentFg,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  debugText: { color: Colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 1.0 },
});
