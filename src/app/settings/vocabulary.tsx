import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { EmptyState } from '@/ui/components/EmptyState';
import { LearnedKeywordRepository } from '@/data/repositories/LearnedKeywordRepository';
import { db } from '@/data/db/client';
import type { LearnedKeyword } from '@/data/repositories/LearnedKeywordRepository';

const repo = new LearnedKeywordRepository(db);
const DEPTH = 4;

type VocabTab = 'ACTIVE' | 'PENDING' | 'DEMOTED';

export default function VocabularyScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<VocabTab>('ACTIVE');

  const { data: all = [] } = useQuery({
    queryKey: ['learned-keywords'],
    queryFn: () => repo.getAll(),
    refetchInterval: 10000,
  });

  const setStatusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: LearnedKeyword['status'] }) =>
      repo.setStatus(id, status),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['learned-keywords'] }),
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['learned-keywords'] }),
  });

  const filtered = all.filter((k) => k.status === tab);
  const tabCounts: Record<VocabTab, number> = {
    ACTIVE: all.filter((k) => k.status === 'ACTIVE').length,
    PENDING: all.filter((k) => k.status === 'PENDING').length,
    DEMOTED: all.filter((k) => k.status === 'DEMOTED').length,
  };

  const handleRemove = (kw: LearnedKeyword): void => {
    Alert.alert('Remove keyword?', `"${kw.ngram}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(kw.id) },
    ]);
  };

  const emptyMessages: Record<VocabTab, { title: string; description: string }> = {
    ACTIVE: {
      title: 'No active keywords',
      description:
        'TaskMind learns from tasks you confirm. Phrases seen 3+ times are promoted here and improve detection.',
    },
    PENDING: {
      title: 'Nothing pending',
      description: 'Phrases seen fewer than 3 times appear here while accumulating evidence.',
    },
    DEMOTED: {
      title: 'Nothing demoted',
      description: 'Keywords you remove from Active appear here.',
    },
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Learned Vocabulary</Text>
        <View style={{ width: 56 }} />
      </View>

      {/* Tab bar */}
      <View
        style={[
          styles.tabBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.outline },
        ]}
      >
        {(['ACTIVE', 'PENDING', 'DEMOTED'] as VocabTab[]).map((t) => (
          <Pressable
            key={t}
            style={[styles.tab, tab === t && styles.tabActive]}
            onPress={() => setTab(t)}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.onSurfaceVariant },
                tab === t && styles.tabTextActive,
                tab === t && { color: theme.primary },
              ]}
            >
              {t.charAt(0) + t.slice(1).toLowerCase()} ({tabCounts[t]})
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={filtered.length === 0 ? styles.emptyContainer : styles.list}
        ListEmptyComponent={
          <EmptyState
            title={emptyMessages[tab].title}
            description={emptyMessages[tab].description}
          />
        }
        renderItem={({ item }) => (
          <View style={[styles.rowWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
            <View style={styles.rowShadow} />
            <View style={[styles.row, { backgroundColor: theme.surface }]}>
              <View style={styles.rowMain}>
                <Text style={[styles.phrase, { color: theme.onSurface }]}>{item.ngram}</Text>
                <Text style={[styles.meta, { color: theme.onSurfaceVariant }]}>
                  {item.language} · seen {item.occurrenceCount}×
                </Text>
              </View>
              <View style={styles.actions}>
                {tab === 'PENDING' && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => setStatusMutation.mutate({ id: item.id, status: 'ACTIVE' })}
                  >
                    <Text style={[styles.actionBtnText, { color: Colors.success }]}>Activate</Text>
                  </Pressable>
                )}
                {tab === 'ACTIVE' && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => setStatusMutation.mutate({ id: item.id, status: 'DEMOTED' })}
                  >
                    <Text style={[styles.actionBtnText, { color: theme.onSurfaceVariant }]}>
                      Demote
                    </Text>
                  </Pressable>
                )}
                {tab === 'DEMOTED' && (
                  <Pressable
                    style={styles.actionBtn}
                    onPress={() => setStatusMutation.mutate({ id: item.id, status: 'ACTIVE' })}
                  >
                    <Text style={[styles.actionBtnText, { color: Colors.success }]}>Restore</Text>
                  </Pressable>
                )}
                <Pressable style={styles.actionBtn} onPress={() => handleRemove(item)}>
                  <Text style={[styles.actionBtnText, { color: Colors.urgentFg }]}>Remove</Text>
                </Pressable>
              </View>
            </View>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primary900,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
  },
  backBtn: { padding: 4, minWidth: 56 },
  backText: { fontSize: 15, color: Colors.white, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '800', color: Colors.white },
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 2,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 3,
    borderBottomColor: Colors.transparent,
  },
  tabActive: { borderBottomColor: Colors.primary900 },
  tabText: { fontSize: 12, fontWeight: '600' },
  tabTextActive: { fontWeight: '800' },
  list: { paddingTop: 8, paddingBottom: 16 },
  emptyContainer: { flex: 1 },
  rowWrapper: { marginHorizontal: 16, marginVertical: 4, position: 'relative' },
  rowShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    padding: 14,
  },
  rowMain: { flex: 1 },
  phrase: { fontSize: 14, fontWeight: '700', marginBottom: 2 },
  meta: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 4 },
  actionBtnText: { fontSize: 12, fontWeight: '700' },
});
