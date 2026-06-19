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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { TaskCard } from '@/ui/components/TaskCard';
import { EmptyState } from '@/ui/components/EmptyState';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import NotificationListener from '../../../modules/notification-listener/src';
import type { Task, Priority } from '@/domain/types';
import { useTaskStore } from '@/state/taskStore';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';

const taskRepo = new TaskRepository(db);

const PRIORITY_ORDER: Record<Priority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

const FILTERS: Array<{ label: string; value: 'ALL' | Priority }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Urgent', value: 'URGENT' },
  { label: 'High', value: 'HIGH' },
  { label: 'Medium', value: 'MEDIUM' },
  { label: 'Low', value: 'LOW' },
];

interface Section {
  title: string;
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
  if (today.length > 0) sections.push({ title: 'Today', data: today });
  if (thisWeek.length > 0) sections.push({ title: 'This Week', data: thisWeek });
  if (older.length > 0) sections.push({ title: 'Older', data: older });
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
  const subtitle =
    tasks.length === 0
      ? 'You’re all caught up'
      : `${tasks.length} pending${urgentCount > 0 ? ` · ${urgentCount} urgent` : ''}`;

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
      <Screen>
        <LargeHeader
          title="Tasks"
          subtitle={subtitle}
          right={
            <>
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
                  <Ionicons name="refresh" size={22} color={theme.onSurfaceVariant} />
                )}
              </Pressable>
              <Pressable
                onPress={toggleSearch}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel="Search"
                hitSlop={8}
              >
                <Ionicons
                  name={searchVisible ? 'close' : 'search'}
                  size={21}
                  color={theme.onSurfaceVariant}
                />
              </Pressable>
            </>
          }
        />

        {searchVisible && (
          <View style={styles.searchWrap}>
            <TextInput
              style={[
                styles.searchInput,
                { color: theme.onSurface, backgroundColor: theme.surfaceVariant },
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

        {/* Filter chips */}
        <View style={styles.filterRow}>
          {FILTERS.map((f) => {
            const active = activeFilter === f.value;
            return (
              <Pressable
                key={f.value}
                style={[
                  styles.filterChip,
                  { backgroundColor: active ? Colors.primary500 : theme.surfaceVariant },
                ]}
                onPress={() => setActiveFilter(f.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[
                    styles.filterChipText,
                    { color: active ? Colors.white : theme.onSurfaceVariant },
                  ]}
                >
                  {f.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

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
            <Text
              style={[
                styles.sectionHeader,
                { color: theme.onSurfaceVariant, backgroundColor: theme.background },
              ]}
            >
              {section.title}
            </Text>
          )}
          contentContainerStyle={sections.length === 0 ? styles.emptyContainer : styles.list}
          ListEmptyComponent={
            isLoading ? null : (
              <EmptyState
                title={searchQuery ? 'No results' : 'All clear'}
                description={
                  searchQuery
                    ? 'No tasks match your search.'
                    : 'Notifications from your monitored apps will turn into tasks here automatically.'
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

        <Pressable
          style={({ pressed }) => [
            styles.fab,
            pressed && { opacity: 0.85, transform: [{ scale: 0.96 }] },
          ]}
          onPress={() => router.push('/task/create')}
          accessibilityRole="button"
          accessibilityLabel="Create new task"
        >
          <Ionicons name="add" size={30} color={Colors.white} />
        </Pressable>
      </Screen>
    </SwipeNavigator>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 38, height: 38, justifyContent: 'center', alignItems: 'center' },

  searchWrap: { paddingHorizontal: 20, paddingTop: 4, paddingBottom: 4 },
  searchInput: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 16,
    fontSize: 15,
  },

  filterRow: { flexDirection: 'row', paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  filterChip: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterChipText: { fontSize: 13, fontWeight: '600' },

  list: { paddingBottom: 110 },
  emptyContainer: { flexGrow: 1 },

  sectionHeader: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 8,
  },

  fab: {
    position: 'absolute',
    bottom: 24,
    right: 20,
    width: 56,
    height: 56,
    backgroundColor: Colors.primary500,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: Colors.primary500,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
});
