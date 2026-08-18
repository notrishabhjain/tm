import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme, getPriorityColor } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { db, initializeDatabase } from '@/data/db/client';
import { TaskRepository, type ReviewItem } from '@/data/repositories/TaskRepository';
import { acceptReviewItem, dismissReviewItem } from '@/services/task-intake';
import { appDisplayName } from '@/services/app-name-map';

const repo = new TaskRepository(db);

function sourceLine(item: ReviewItem): string {
  const who = item.sourceLabel ?? 'Unknown';
  if (item.sourceType === 'CALL') return `Call with ${who}`;
  const app = item.sourceApp ? appDisplayName(item.sourceApp) : 'Message';
  return `${who} · ${app}`;
}

/**
 * The Review Inbox.
 *
 * This exists because the on-device classifier is smaller and blunter than a
 * cloud model: rather than choose between inventing a wrong task and dropping a
 * real commitment, anything it is unsure about waits here for one tap.
 */
export default function ReviewScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  // Ids currently being resolved — prevents a double tap creating two tasks.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const { data, refetch, isRefetching } = useQuery({
    queryKey: ['review'],
    queryFn: async () => {
      try {
        initializeDatabase();
      } catch {
        return { items: [] as ReviewItem[], failed: true };
      }
      // Items that have waited too long are retired rather than lingering
      // forever as a growing pile the user will never work through.
      await repo.expireStaleReviews(30 * 24 * 60 * 60 * 1000).catch(() => {});
      return { items: await repo.listReview(200), failed: false };
    },
  });

  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch])
  );

  const items = data?.items ?? [];

  const resolve = (id: string, accept: boolean): void => {
    if (busy.has(id)) return;
    setBusy((b) => new Set(b).add(id));
    void (async () => {
      try {
        if (accept) await acceptReviewItem(id);
        else await dismissReviewItem(id);
      } finally {
        setBusy((b) => {
          const next = new Set(b);
          next.delete(id);
          return next;
        });
        void refetch();
      }
    })();
  };

  const renderItem = ({ item }: { item: ReviewItem }): React.JSX.Element => {
    const pending = busy.has(item.id);
    return (
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
        <View style={styles.metaRow}>
          <View style={[styles.dot, { backgroundColor: getPriorityColor(item.priority) }]} />
          <Text style={[styles.meta, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
            {sourceLine(item)}
          </Text>
          {item.confidence != null && (
            <Text style={[styles.confidence, { color: theme.onSurfaceVariant }]}>
              {Math.round(item.confidence * 100)}% sure
            </Text>
          )}
        </View>

        <Text style={[styles.title, { color: theme.onSurface }]}>{item.title}</Text>

        {item.sourceText ? (
          <Text style={[styles.quote, { color: theme.onSurfaceVariant }]} numberOfLines={3}>
            “{item.sourceText}”
          </Text>
        ) : null}

        {item.reasoning ? (
          <Text style={[styles.reason, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
            {item.reasoning}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            onPress={() => resolve(item.id, false)}
            disabled={pending}
            style={({ pressed }) => [
              styles.btn,
              { borderColor: theme.outline },
              (pressed || pending) && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Dismiss ${item.title}`}
          >
            <Ionicons name="close" size={16} color={theme.onSurfaceVariant} />
            <Text style={[styles.btnText, { color: theme.onSurfaceVariant }]}>Not a task</Text>
          </Pressable>

          <Pressable
            onPress={() => resolve(item.id, true)}
            disabled={pending}
            style={({ pressed }) => [
              styles.btn,
              styles.btnPrimary,
              { backgroundColor: theme.primary, borderColor: theme.primary },
              (pressed || pending) && { opacity: 0.5 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Add ${item.title} as a task`}
          >
            <Ionicons name="checkmark" size={16} color={theme.background} />
            <Text style={[styles.btnText, { color: theme.background }]}>Add task</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <Screen>
      <LargeHeader
        title="Review"
        subtitle="Things the on-device model wasn't sure about"
        onBack={() => router.back()}
      />
      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        renderItem={renderItem}
        contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listContent}
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
            <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>
              {data?.failed ? 'Storage unavailable' : 'Nothing to review'}
            </Text>
            <Text style={[styles.emptyBody, { color: theme.onSurfaceVariant }]}>
              {data?.failed
                ? 'The database could not be opened. Reopen the app and try again.'
                : 'When the classifier is unsure whether a message is a task, it waits here instead of guessing.'}
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
  card: { borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  meta: { fontSize: 12, flex: 1 },
  confidence: { fontSize: 11, fontVariant: ['tabular-nums'] },
  title: { fontSize: 15, fontWeight: '700', lineHeight: 20 },
  quote: { fontSize: 12.5, marginTop: 8, lineHeight: 17, fontStyle: 'italic' },
  reason: { fontSize: 11.5, marginTop: 6, lineHeight: 16 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 9,
    borderWidth: 1,
  },
  btnPrimary: {},
  btnText: { fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', gap: 10 },
  emptyTitle: { fontSize: 17, fontWeight: '700', textAlign: 'center' },
  emptyBody: { fontSize: 13, textAlign: 'center', lineHeight: 19 },
});
