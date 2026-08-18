import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  TextInput,
  Alert,
  RefreshControl,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, getPriorityColor } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { db, initializeDatabase } from '@/data/db/client';
import { TaskRepository, type Task, type TaskFilter } from '@/data/repositories/TaskRepository';
import { createManualTask } from '@/services/task-intake';
import { appDisplayName } from '@/services/app-name-map';

const repo = new TaskRepository(db);

const FILTERS: { key: TaskFilter; label: string }[] = [
  { key: 'TODAY', label: 'Today' },
  { key: 'UPCOMING', label: 'Upcoming' },
  { key: 'OVERDUE', label: 'Overdue' },
  { key: 'COMPLETED', label: 'Done' },
];

/** Human due-date label. Returns null when the task carries no deadline. */
function dueLabel(dueAt: number | null): { text: string; overdue: boolean } | null {
  if (dueAt == null) return null;
  const now = Date.now();
  const d = new Date(dueAt);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const dayDiff = Math.floor((d.getTime() - startOfToday.getTime()) / 86_400_000);
  const time =
    d.getHours() === 0 && d.getMinutes() === 0
      ? ''
      : ` ${d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}`;

  let day: string;
  if (dayDiff === 0) day = 'Today';
  else if (dayDiff === 1) day = 'Tomorrow';
  else if (dayDiff === -1) day = 'Yesterday';
  else if (dayDiff > 1 && dayDiff < 7) day = d.toLocaleDateString('en-IN', { weekday: 'long' });
  else day = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return { text: `${day}${time}`, overdue: dueAt < now };
}

/** Where a task came from, in words the user recognises. */
function sourceLabelOf(task: Task): string {
  if (task.sourceType === 'MANUAL') return 'Added by you';
  const who = task.sourceLabel ?? 'Unknown';
  if (task.sourceType === 'CALL') return `Call with ${who}`;
  const app = task.sourceApp ? appDisplayName(task.sourceApp) : 'Message';
  return `${who} · ${app}`;
}

export default function TasksScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [filter, setFilter] = useState<TaskFilter>('TODAY');
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['tasks', filter],
    queryFn: async () => {
      try {
        initializeDatabase();
      } catch {
        // A broken database must still render a screen rather than a white void.
        return { tasks: [] as Task[], reviewCount: 0, failed: true };
      }
      const [tasks, review] = await Promise.all([repo.list(filter), repo.listReview(200)]);
      return { tasks, reviewCount: review.length, failed: false };
    },
  });

  // The pipeline writes from background contexts, so the list must re-read on
  // every focus rather than trusting cached data.
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const tasks = useMemo(() => data?.tasks ?? [], [data]);
  const reviewCount = data?.reviewCount ?? 0;

  const toggleComplete = (task: Task): void => {
    void (async () => {
      await repo.setStatus(task.id, task.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED');
      void refetch();
    })();
  };

  const confirmDelete = (task: Task): void => {
    Alert.alert('Delete task?', task.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            await repo.setStatus(task.id, 'DELETED');
            void refetch();
          })();
        },
      },
    ]);
  };

  const submitDraft = (): void => {
    const title = draft.trim();
    if (!title) {
      setComposing(false);
      return;
    }
    void (async () => {
      await createManualTask({ title });
      setDraft('');
      setComposing(false);
      void refetch();
    })();
  };

  const renderTask = ({ item }: { item: Task }): React.JSX.Element => {
    const due = dueLabel(item.dueAt);
    const done = item.status === 'COMPLETED';
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
        <Pressable
          onPress={() => toggleComplete(item)}
          hitSlop={8}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? `Mark ${item.title} as not done` : `Complete ${item.title}`}
          style={styles.checkbox}
        >
          <Ionicons
            name={done ? 'checkmark-circle' : 'ellipse-outline'}
            size={24}
            color={done ? theme.primary : theme.onSurfaceVariant}
          />
        </Pressable>

        <View style={styles.cardBody}>
          <Text
            style={[
              styles.taskTitle,
              { color: theme.onSurface },
              done && { textDecorationLine: 'line-through', color: theme.onSurfaceVariant },
            ]}
          >
            {item.title}
          </Text>

          <View style={styles.metaRow}>
            <View
              style={[styles.priorityDot, { backgroundColor: getPriorityColor(item.priority) }]}
            />
            <Text style={[styles.metaText, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
              {sourceLabelOf(item)}
            </Text>
          </View>

          {due && (
            <Text
              style={[
                styles.dueText,
                { color: due.overdue && !done ? '#DC2626' : theme.onSurfaceVariant },
              ]}
            >
              {due.overdue && !done ? '⚠ ' : ''}
              {due.text}
            </Text>
          )}

          {item.notes ? (
            <Text style={[styles.notes, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
              {item.notes}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => confirmDelete(item)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Delete ${item.title}`}
          style={styles.deleteBtn}
        >
          <Ionicons name="trash-outline" size={18} color={theme.onSurfaceVariant} />
        </Pressable>
      </View>
    );
  };

  const emptyCopy = (): { title: string; body: string } => {
    if (data?.failed) {
      return {
        title: 'Storage unavailable',
        body: 'The task database could not be opened. Reopen the app; if this persists, the database will rebuild itself automatically.',
      };
    }
    switch (filter) {
      case 'TODAY':
        return {
          title: 'Nothing due today',
          body: 'Tasks found in your messages and calls land here automatically. Add one yourself with the + button.',
        };
      case 'UPCOMING':
        return { title: 'Nothing scheduled', body: 'Tasks with a future deadline appear here.' };
      case 'OVERDUE':
        return { title: 'Nothing overdue', body: 'Anything past its deadline will show up here.' };
      case 'COMPLETED':
        return { title: 'Nothing completed yet', body: 'Tasks you tick off are kept here.' };
      default:
        return { title: 'No tasks', body: 'Nothing captured yet.' };
    }
  };

  return (
    <Screen>
      <LargeHeader
        title="Tasks"
        subtitle="Captured from your messages and calls"
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={() => setComposing((c) => !c)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Add a task"
          >
            <Ionicons name={composing ? 'close' : 'add'} size={26} color={theme.primary} />
          </Pressable>
        }
      />

      {reviewCount > 0 && (
        <Pressable
          onPress={() => router.push('/review')}
          style={({ pressed }) => [
            styles.reviewBanner,
            { backgroundColor: theme.surfaceVariant, borderColor: theme.outline },
            pressed && { opacity: 0.7 },
          ]}
          accessibilityRole="button"
        >
          <Ionicons name="help-circle-outline" size={18} color={theme.primary} />
          <Text style={[styles.reviewText, { color: theme.onSurface }]}>
            {reviewCount} item{reviewCount !== 1 ? 's' : ''} need{reviewCount === 1 ? 's' : ''} your
            review
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.onSurfaceVariant} />
        </Pressable>
      )}

      {composing && (
        <View style={[styles.composer, { borderColor: theme.outline }]}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder="What needs doing?"
            placeholderTextColor={theme.onSurfaceVariant}
            style={[styles.input, { color: theme.onSurface, borderColor: theme.outline }]}
            autoFocus
            returnKeyType="done"
            onSubmitEditing={submitDraft}
            accessibilityLabel="New task title"
          />
          <Pressable onPress={submitDraft} hitSlop={8} accessibilityRole="button">
            <Text style={[styles.addText, { color: theme.primary }]}>Add</Text>
          </Pressable>
        </View>
      )}

      <View style={styles.filterRow}>
        {FILTERS.map((f) => {
          const active = f.key === filter;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={[
                styles.filterChip,
                { borderColor: theme.outline },
                active && { backgroundColor: theme.primary, borderColor: theme.primary },
              ]}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
            >
              <Text
                style={[
                  styles.filterText,
                  { color: active ? theme.background : theme.onSurfaceVariant },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <FlatList
        data={tasks}
        keyExtractor={(t) => t.id}
        renderItem={renderTask}
        contentContainerStyle={tasks.length === 0 ? styles.emptyWrap : styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons
              name={data?.failed ? 'warning-outline' : 'checkmark-done-outline'}
              size={40}
              color={theme.onSurfaceVariant}
            />
            <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>{emptyCopy().title}</Text>
            <Text style={[styles.emptyBody, { color: theme.onSurfaceVariant }]}>
              {emptyCopy().body}
            </Text>
          </View>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  listContent: { paddingHorizontal: 16, paddingBottom: 40 },
  emptyWrap: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32 },
  card: {
    flexDirection: 'row',
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    alignItems: 'flex-start',
  },
  checkbox: { paddingRight: 10, paddingTop: 1 },
  cardBody: { flex: 1 },
  taskTitle: { fontSize: 15, fontWeight: '600', lineHeight: 20 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 5, gap: 6 },
  priorityDot: { width: 7, height: 7, borderRadius: 4 },
  metaText: { fontSize: 12, flex: 1 },
  dueText: { fontSize: 12, marginTop: 3, fontWeight: '500' },
  notes: { fontSize: 12, marginTop: 5, lineHeight: 16 },
  deleteBtn: { paddingLeft: 10, paddingTop: 1 },
  filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  filterText: { fontSize: 13, fontWeight: '600' },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  reviewText: { flex: 1, fontSize: 13, fontWeight: '600' },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  input: { flex: 1, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  addText: { fontSize: 15, fontWeight: '700' },
  empty: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
