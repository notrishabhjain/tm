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
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';

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
    <Screen>
      <LargeHeader title="Task Report" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        >
          <Text style={[styles.cardTitle, { color: theme.onSurface }]}>Export format</Text>
          <View style={styles.formatRow}>
            {(['csv', 'json'] as const).map((f) => (
              <Pressable
                key={f}
                onPress={() => setFormat(f)}
                style={({ pressed }) => [
                  styles.formatBtn,
                  {
                    backgroundColor: format === f ? Colors.primary500 : theme.surfaceVariant,
                  },
                  pressed && { opacity: 0.7 },
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
            style={({ pressed }) => [
              styles.exportBtn,
              { backgroundColor: Colors.primary500 },
              pressed && !loading && { opacity: 0.7 },
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

        <Text style={[styles.footnote, { color: theme.onSurfaceVariant }]}>
          Generates a file of all your pending and completed tasks, then opens the system share
          sheet. You can send it via Gmail, save to Drive, or share anywhere.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12 },

  sectionCard: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
  },
  cardTitle: { fontSize: 15, fontWeight: '600', marginBottom: 12 },

  formatRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  formatBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  formatBtnText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },

  hint: { fontSize: 13, lineHeight: 18, marginBottom: 10 },
  stats: { fontSize: 12, marginBottom: 10 },

  exportBtn: {
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 4,
  },
  exportBtnText: { fontSize: 15, fontWeight: '600', color: Colors.white },

  footnote: { fontSize: 12, lineHeight: 18, paddingHorizontal: 4 },
});
