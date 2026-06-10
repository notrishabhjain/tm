import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';

const DEPTH = 4;

type ReportFormat = 'json' | 'csv';

function formatDate(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

function buildCsv(
  pending: Awaited<ReturnType<TaskRepository['getPendingTasks']>>,
  completed: Awaited<ReturnType<TaskRepository['getCompletedTasks']>>
): string {
  const header = 'status,title,priority,source_app,sender,due_date,created_at,completed_at';
  const rows = [
    ...pending.map((t) =>
      [
        'PENDING',
        `"${t.title.replace(/"/g, '""')}"`,
        t.priority,
        t.sourceApp ?? '',
        `"${(t.sender ?? '').replace(/"/g, '""')}"`,
        formatDate(t.dueDate ?? null),
        formatDate(t.createdAt),
        '',
      ].join(',')
    ),
    ...completed.map((t) =>
      [
        'COMPLETE',
        `"${t.title.replace(/"/g, '""')}"`,
        t.priority,
        t.sourceApp ?? '',
        `"${(t.sender ?? '').replace(/"/g, '""')}"`,
        formatDate(t.dueDate ?? null),
        formatDate(t.createdAt),
        formatDate(t.completedAt ?? null),
      ].join(',')
    ),
  ];
  return [header, ...rows].join('\n');
}

function buildJson(
  pending: Awaited<ReturnType<TaskRepository['getPendingTasks']>>,
  completed: Awaited<ReturnType<TaskRepository['getCompletedTasks']>>
): string {
  return JSON.stringify(
    {
      generated_at: new Date().toISOString(),
      pending_count: pending.length,
      completed_count: completed.length,
      pending: pending.map((t) => ({
        title: t.title,
        priority: t.priority,
        source_app: t.sourceApp,
        sender: t.sender,
        due_date: t.dueDate ? formatDate(t.dueDate) : null,
        created_at: formatDate(t.createdAt),
      })),
      completed: completed.map((t) => ({
        title: t.title,
        priority: t.priority,
        source_app: t.sourceApp,
        sender: t.sender,
        created_at: formatDate(t.createdAt),
        completed_at: t.completedAt ? formatDate(t.completedAt) : null,
      })),
    },
    null,
    2
  );
}

export default function EmailReportScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [format, setFormat] = useState<ReportFormat>('csv');
  const [loading, setLoading] = useState(false);
  const [lastStats, setLastStats] = useState<{ pending: number; completed: number } | null>(null);

  const handleExport = useCallback(async () => {
    setLoading(true);
    try {
      const repo = new TaskRepository(db);
      const [pending, completed] = await Promise.all([
        repo.getPendingTasks(),
        repo.getCompletedTasks(),
      ]);

      setLastStats({ pending: pending.length, completed: completed.length });

      const ts = new Date().toISOString().slice(0, 10);
      const ext = format === 'csv' ? 'csv' : 'json';
      const filename = `taskmind-report-${ts}.${ext}`;
      const path = `${FileSystem.cacheDirectory ?? '/tmp/'}${filename}`;
      const content =
        format === 'csv' ? buildCsv(pending, completed) : buildJson(pending, completed);

      await FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: format === 'csv' ? 'text/csv' : 'application/json',
          dialogTitle: 'Share TaskMind Report',
          UTI: format === 'csv' ? 'public.comma-separated-values-text' : 'public.json',
        });
      } else {
        Alert.alert('Sharing unavailable', `Report saved to:\n${path}`);
      }
    } catch (e) {
      Alert.alert(
        'Export failed',
        e instanceof Error ? e.message : 'Could not generate the report. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [format]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Task Report</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900 },
            ]}
          >
            <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Export format</Text>
            <View style={styles.formatRow}>
              {(['csv', 'json'] as const).map((f) => (
                <Pressable
                  key={f}
                  onPress={() => setFormat(f)}
                  style={[
                    styles.formatBtn,
                    {
                      backgroundColor: format === f ? Colors.primary900 : theme.surfaceVariant,
                      borderColor: format === f ? Colors.primary900 : theme.outline,
                    },
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: format === f }}
                >
                  <Text
                    style={[
                      styles.formatBtnText,
                      { color: format === f ? Colors.white : theme.onSurface },
                    ]}
                  >
                    {f.toUpperCase()}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
              {format === 'csv'
                ? 'Spreadsheet-friendly. Open in Excel, Sheets, or attach to Gmail.'
                : 'Structured data. Useful for scripting or importing.'}
            </Text>

            {lastStats && (
              <Text style={[styles.stats, { color: theme.onSurfaceVariant }]}>
                Last export: {lastStats.pending} pending · {lastStats.completed} completed
              </Text>
            )}

            <Pressable
              onPress={() => void handleExport()}
              style={[
                styles.exportBtn,
                { backgroundColor: Colors.primary900, borderColor: Colors.primary900 },
              ]}
              disabled={loading}
              accessibilityRole="button"
            >
              {loading ? (
                <ActivityIndicator color={Colors.white} />
              ) : (
                <Text style={styles.exportBtnText}>Generate &amp; Share</Text>
              )}
            </Pressable>
          </View>
        </View>

        <Text style={[styles.footnote, { color: theme.onSurfaceVariant }]}>
          Generates a file of all your pending and completed tasks, then opens the system share
          sheet. You can send it via Gmail, save to Drive, or share anywhere.
        </Text>
      </ScrollView>
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
  content: { padding: 16, paddingBottom: 48, gap: 8 },

  sectionWrapper: { position: 'relative' },
  sectionShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  sectionCard: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '800', marginBottom: 12 },

  formatRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
  formatBtn: {
    flex: 1,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderRadius: 2,
    alignItems: 'center',
  },
  formatBtnText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.5 },

  hint: { fontSize: 12, lineHeight: 18, marginBottom: 10 },
  stats: { fontSize: 12, marginBottom: 10 },

  exportBtn: {
    paddingVertical: 13,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    marginTop: 4,
  },
  exportBtnText: { fontSize: 14, fontWeight: '800', color: Colors.white },

  footnote: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});
