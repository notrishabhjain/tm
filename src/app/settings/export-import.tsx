import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import { tasksToCSV, tasksToJSON, parseImportJSON } from '@/services/task-exporter';
import type { Task } from '@/domain/types';

const taskRepo = new TaskRepository(db);
const DEPTH = 4;

export default function ExportImportScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<{
    tasks: Partial<Task>[];
    errors: string[];
  } | null>(null);

  async function exportFormat(fmt: 'json' | 'csv'): Promise<void> {
    setBusy(true);
    try {
      const [pending, completed] = await Promise.all([
        taskRepo.getPendingTasks(),
        taskRepo.getCompletedTasks(),
      ]);
      const all = [...pending, ...completed];

      const content = fmt === 'json' ? tasksToJSON(all) : tasksToCSV(all);
      const ext = fmt === 'json' ? 'json' : 'csv';
      const mime = fmt === 'json' ? 'application/json' : 'text/csv';
      const filename = `taskmind-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
      const path = `${FileSystem.cacheDirectory ?? '/tmp/'}${filename}`;

      await FileSystem.writeAsStringAsync(path, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: mime, dialogTitle: 'Export TaskMind tasks' });
      } else {
        Alert.alert('Saved', `File saved to cache: ${filename}`);
      }
    } catch (err) {
      Alert.alert('Export Failed', String(err));
    } finally {
      setBusy(false);
    }
  }

  async function pickImportFile(): Promise<void> {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.[0]) {
        setBusy(false);
        return;
      }
      const uri = result.assets[0].uri;
      const content = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const parsed = parseImportJSON(content);
      setImportPreview(parsed);
    } catch (err) {
      Alert.alert('Import Failed', String(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmImport(mode: 'merge' | 'replace'): Promise<void> {
    if (!importPreview) return;
    setBusy(true);
    try {
      if (mode === 'replace') {
        const existing = await taskRepo.getPendingTasks();
        await Promise.all(existing.map((t) => taskRepo.deleteTask(t.id)));
      }

      let imported = 0;
      for (const t of importPreview.tasks) {
        if (!t.title) continue;
        await taskRepo.createTask({
          title: t.title,
          body: t.body ?? undefined,
          sourceApp: t.sourceApp ?? 'import',
          sender: t.sender ?? undefined,
          priority: t.priority ?? 'MEDIUM',
          confidence: t.confidence ?? 0.5,
          ruleScore: 0,
          language: 'EN',
          matchedKeywords: [],
          needsConfirmation: false,
        });
        imported++;
      }

      setImportPreview(null);
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      Alert.alert('Import Complete', `${imported} task${imported !== 1 ? 's' : ''} imported.`);
    } catch (err) {
      Alert.alert('Import Failed', String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Export / Import</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>EXPORT</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.cardHint, { color: theme.onSurfaceVariant }]}>
              Export all your tasks (pending + completed) to share or back up.
            </Text>
            <View style={styles.btnRow}>
              <Button
                label="Export JSON"
                variant="primary"
                onPress={() => void exportFormat('json')}
                loading={busy}
                style={styles.halfBtn}
              />
              <Button
                label="Export CSV"
                variant="secondary"
                onPress={() => void exportFormat('csv')}
                loading={busy}
                style={styles.halfBtn}
              />
            </View>
          </View>
        </View>

        <Text style={[styles.sectionLabel, { color: theme.primary }]}>IMPORT</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            <Text style={[styles.cardHint, { color: theme.onSurfaceVariant }]}>
              Import tasks from a TaskMind JSON export. Merge with existing tasks or replace all
              pending tasks.
            </Text>
            {!importPreview ? (
              <Button
                label="Pick JSON File"
                variant="secondary"
                onPress={() => void pickImportFile()}
                loading={busy}
              />
            ) : (
              <View style={styles.previewSection}>
                <View
                  style={[
                    styles.previewBox,
                    { backgroundColor: theme.background, borderColor: theme.outline },
                  ]}
                >
                  <Text style={[styles.previewTitle, { color: theme.onSurface }]}>
                    {importPreview.tasks.length} tasks found
                  </Text>
                  {importPreview.errors.length > 0 && (
                    <Text style={styles.previewErrors}>
                      {importPreview.errors.length} warning
                      {importPreview.errors.length !== 1 ? 's' : ''}:{' '}
                      {importPreview.errors.slice(0, 3).join('; ')}
                    </Text>
                  )}
                </View>
                <View style={styles.btnRow}>
                  <Button
                    label="Merge"
                    variant="primary"
                    onPress={() => void confirmImport('merge')}
                    loading={busy}
                    style={styles.halfBtn}
                  />
                  <Button
                    label="Replace Pending"
                    variant="destructive"
                    onPress={() => void confirmImport('replace')}
                    loading={busy}
                    style={styles.halfBtn}
                  />
                </View>
                <Pressable onPress={() => setImportPreview(null)} style={styles.cancelLink}>
                  <Text style={[styles.cancelText, { color: theme.onSurfaceVariant }]}>Cancel</Text>
                </Pressable>
              </View>
            )}
            {busy && <ActivityIndicator style={styles.spinner} color={Colors.primary900} />}
          </View>
        </View>
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
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 16,
  },
  cardWrapper: { position: 'relative', marginBottom: 4 },
  cardShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  card: {
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    padding: 16,
    gap: 12,
  },
  cardHint: { fontSize: 13, lineHeight: 19 },
  btnRow: { flexDirection: 'row', gap: 10 },
  halfBtn: { flex: 1 },
  previewSection: { gap: 12 },
  previewBox: {
    borderWidth: 1,
    borderRadius: 2,
    padding: 12,
  },
  previewTitle: { fontSize: 14, fontWeight: '700' },
  previewErrors: { fontSize: 12, color: Colors.warning, marginTop: 4 },
  cancelLink: { alignSelf: 'center', paddingVertical: 8 },
  cancelText: { fontSize: 13, fontWeight: '600' },
  spinner: { marginTop: 8 },
});
