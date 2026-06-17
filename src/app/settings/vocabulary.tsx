import React, { useState } from 'react';
import { View, Text, FlatList, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { EmptyState } from '@/ui/components/EmptyState';
import { LearnedKeywordRepository } from '@/data/repositories/LearnedKeywordRepository';
import { db } from '@/data/db/client';
import type { LearnedKeyword } from '@/data/repositories/LearnedKeywordRepository';

const repo = new LearnedKeywordRepository(db);

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
    <Screen>
      <LargeHeader title="Vocabulary" onBack={() => router.back()} />

      {/* Tab bar */}
      <View style={[styles.tabBar, { borderBottomColor: theme.outline }]}>
        {(['ACTIVE', 'PENDING', 'DEMOTED'] as VocabTab[]).map((t) => (
          <Pressable
            key={t}
            style={({ pressed }) => [
              styles.tab,
              { borderBottomColor: tab === t ? theme.primary : Colors.transparent },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => setTab(t)}
          >
            <Text
              style={[
                styles.tabText,
                { color: tab === t ? theme.primary : theme.onSurfaceVariant },
                tab === t && styles.tabTextActive,
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
          <View
            style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <View style={styles.rowMain}>
              <Text style={[styles.phrase, { color: theme.onSurface }]}>{item.ngram}</Text>
              <Text style={[styles.meta, { color: theme.onSurfaceVariant }]}>
                {item.language} · seen {item.occurrenceCount}×
              </Text>
            </View>
            <View style={styles.actions}>
              {tab === 'PENDING' && (
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setStatusMutation.mutate({ id: item.id, status: 'ACTIVE' })}
                >
                  <Text style={[styles.actionBtnText, { color: Colors.success }]}>Activate</Text>
                </Pressable>
              )}
              {tab === 'ACTIVE' && (
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setStatusMutation.mutate({ id: item.id, status: 'DEMOTED' })}
                >
                  <Text style={[styles.actionBtnText, { color: theme.onSurfaceVariant }]}>
                    Demote
                  </Text>
                </Pressable>
              )}
              {tab === 'DEMOTED' && (
                <Pressable
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                  onPress={() => setStatusMutation.mutate({ id: item.id, status: 'ACTIVE' })}
                >
                  <Text style={[styles.actionBtnText, { color: Colors.success }]}>Restore</Text>
                </Pressable>
              )}
              <Pressable
                style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                onPress={() => handleRemove(item)}
              >
                <Text style={[styles.actionBtnText, { color: Colors.urgentFg }]}>Remove</Text>
              </Pressable>
            </View>
          </View>
        )}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 0.5,
    marginTop: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
  },
  tabText: { fontSize: 13, fontWeight: '500' },
  tabTextActive: { fontWeight: '600' },
  list: { paddingTop: 8, paddingBottom: 16, paddingHorizontal: 16, gap: 8 },
  emptyContainer: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
  },
  rowMain: { flex: 1 },
  phrase: { fontSize: 14, fontWeight: '600', marginBottom: 2 },
  meta: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 12 },
  actionBtn: { padding: 4 },
  actionBtnText: { fontSize: 12, fontWeight: '600' },
});
