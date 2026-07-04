import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { Button } from '@/ui/components/Button';
import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { createGoogleTask } from '@/services/google-tasks';
import { getSetting } from '@/data/storage/settings';
import { consumeCallTranscript } from '@/services/call-transcript-stash';
import type { CallTranscriptPayload } from '@/services/call-transcript-stash';
import { extractTasksFromTranscript } from '@/services/transcript-extractor';
import type { TranscriptTask } from '@/services/transcript-extractor';
import NotificationListener from '../../modules/notification-listener/src';

const taskRepo = new TaskRepository(db);

interface TaskItem extends TranscriptTask {
  id: string;
  selected: boolean;
}

type ScreenState = 'loading' | 'review' | 'empty' | 'error';

function formatDue(ts: number): string {
  const d = new Date(ts);
  const diff = Math.floor((d.getTime() - Date.now()) / 86_400_000);
  if (diff < 0) return 'Overdue';
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

function formatCallMeta(callTime: number, callerLabel: string): string {
  const d = new Date(callTime);
  const dateStr = d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
  const timeStr = d.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' });
  return `Call with ${callerLabel} · ${dateStr}, ${timeStr}`;
}

export default function CallTranscriptScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  const [state, setState] = useState<ScreenState>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [canRetry, setCanRetry] = useState(false);
  const [callMeta, setCallMeta] = useState('');
  const [transcriptText, setTranscriptText] = useState('');
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  // The stash is one-shot; keep the payload here so extraction can be retried
  // after a network/AI failure without losing the transcript.
  const payloadRef = useRef<CallTranscriptPayload | null>(null);
  const navTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    void run();
    return () => {
      if (navTimerRef.current) clearTimeout(navTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const run = async (): Promise<void> => {
    setState('loading');

    // Resolve API key: prefer explicit Cloud AI key; fall back to the NVIDIA key
    // used for call transcription (same platform, different service endpoint).
    let resolvedApiKey: string = getSetting('ai_api_key') ?? '';
    if (!resolvedApiKey) {
      try {
        resolvedApiKey = (await NotificationListener.getNvidiaApiKey()) ?? '';
      } catch {
        resolvedApiKey = '';
      }
    }
    if (!resolvedApiKey) {
      setErrorMsg(
        'An NVIDIA API key is required to analyse call transcripts.\n\nAdd one in Settings → Call Transcription → NVIDIA API Key.'
      );
      setCanRetry(false);
      setState('error');
      return;
    }

    const payload = consumeCallTranscript() ?? payloadRef.current;
    if (!payload) {
      setErrorMsg(
        'No transcript was received.\n\nMake sure Call Transcription is enabled and all required permissions are granted in Settings → Call Transcription.'
      );
      setCanRetry(false);
      setState('error');
      return;
    }
    payloadRef.current = payload;

    const text = payload.text.trim();
    setTranscriptText(text);
    setCallMeta(formatCallMeta(payload.callTime, payload.callerLabel));

    if (!text) {
      setState('empty');
      return;
    }

    const extracted = await extractTasksFromTranscript(
      text,
      { referenceTime: payload.callTime, callerLabel: payload.callerLabel },
      resolvedApiKey
    );
    if (extracted === null) {
      setErrorMsg(
        'The AI could not analyse the transcript (network or service error).\n\nYour transcript is safe — tap Retry.'
      );
      setCanRetry(true);
      setState('error');
      return;
    }
    if (extracted.length === 0) {
      setState('empty');
      return;
    }

    setTasks(
      extracted.map((t, i) => ({
        ...t,
        id: `${Date.now()}-${i}`,
        selected: t.assignedToMe, // pre-select only "my" tasks; other-party items opt-in
      }))
    );
    setState('review');
  };

  const toggleTask = (id: string): void => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t)));
  };

  const handleCreate = async (): Promise<void> => {
    const selected = tasks.filter((t) => t.selected);
    if (selected.length === 0) return;
    setSaving(true);
    let created = 0;
    for (const t of selected) {
      try {
        const taskBody = t.notes
          ? `${t.notes}\n\n---\n${transcriptText}`
          : transcriptText || undefined;
        const task = await taskRepo.createTask({
          title: t.title,
          body: taskBody,
          sourceApp: 'call.transcript',
          sender: payloadRef.current?.callerLabel,
          priority: t.priority,
          confidence: 0.85,
          needsConfirmation: false,
          matchedKeywords: ['call_transcript', 'ai_classifier'],
          language: 'EN',
          dueDate: t.dueDate,
        });
        if (getSetting('google_tasks_enabled')) {
          void createGoogleTask({
            title: task.title,
            notes: taskBody,
            dueDate: task.dueDate,
          })
            .then((googleTaskId) => {
              if (googleTaskId) void taskRepo.setGoogleTaskId(task.id, googleTaskId);
            })
            .catch(() => {});
        }
        created++;
      } catch {
        /* non-fatal — keep creating the rest */
      }
    }
    setSaving(false);
    if (created === 0) {
      Alert.alert('Could not save', 'No tasks could be created. Please try again.');
      return;
    }
    setSavedCount(created);
    // Brief confirmation then navigate home
    navTimerRef.current = setTimeout(() => router.replace('/(tabs)/'), 1_500);
  };

  const selectedCount = tasks.filter((t) => t.selected).length;

  if (state === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={Colors.primary500} />
        <Text style={[styles.loadingTitle, { color: theme.onSurface }]}>
          Analysing call transcript…
        </Text>
        <Text style={[styles.loadingHint, { color: theme.onSurfaceVariant }]}>
          AI is extracting action items
        </Text>
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={styles.errorIcon}>⚠</Text>
        <Text style={[styles.errorText, { color: theme.onSurface }]}>{errorMsg}</Text>
        {canRetry && <Button label="Retry" onPress={() => void run()} />}
        <Button label="Go to Home" variant="secondary" onPress={() => router.replace('/(tabs)/')} />
      </View>
    );
  }

  if (state === 'empty') {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.emptyIcon, { color: theme.onSurfaceVariant }]}>✓</Text>
        <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>No action items found</Text>
        {callMeta ? (
          <Text style={[styles.callMetaCentered, { color: theme.onSurfaceVariant }]}>
            {callMeta}
          </Text>
        ) : null}
        <Text style={[styles.emptyHint, { color: theme.onSurfaceVariant }]}>
          The AI found no commitments or tasks in this call transcript.
        </Text>
        <Button label="Go to Home" variant="secondary" onPress={() => router.replace('/(tabs)/')} />
      </View>
    );
  }

  if (savedCount > 0) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={[styles.doneIcon, { color: Colors.success }]}>✓</Text>
        <Text style={[styles.doneText, { color: theme.onSurface }]}>
          {savedCount} task{savedCount !== 1 ? 's' : ''} created
        </Text>
      </View>
    );
  }

  return (
    <Screen>
      <LargeHeader
        title="Call Transcript"
        subtitle={callMeta || undefined}
        onBack={() => {
          if (!saving) router.replace('/(tabs)/');
        }}
      />
      <Text style={[styles.headerSub, { color: theme.onSurfaceVariant }]}>
        {tasks.length} item{tasks.length !== 1 ? 's' : ''} found · {selectedCount} selected
      </Text>

      <FlatList
        data={tasks}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => <TaskRow task={item} onToggle={() => toggleTask(item.id)} />}
        ListHeaderComponent={
          <Pressable
            style={styles.selectAllRow}
            onPress={() =>
              setTasks((prev) => prev.map((t) => ({ ...t, selected: selectedCount < prev.length })))
            }
          >
            <Text style={[styles.selectAllText, { color: theme.primary }]}>
              {selectedCount < tasks.length ? 'Select all' : 'Deselect all'}
            </Text>
          </Pressable>
        }
      />

      <View
        style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outline }]}
      >
        <Pressable
          style={({ pressed }) => [
            styles.createBtn,
            { backgroundColor: Colors.primary500 },
            (saving || selectedCount === 0) && styles.createBtnDisabled,
            pressed && !(saving || selectedCount === 0) && { opacity: 0.7 },
          ]}
          onPress={() => void handleCreate()}
          disabled={saving || selectedCount === 0}
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>
              {selectedCount === 0
                ? 'Select tasks to create'
                : `Create ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`}
            </Text>
          )}
        </Pressable>
        <Button
          label="Dismiss"
          variant="secondary"
          onPress={() => {
            if (!saving) router.replace('/(tabs)/');
          }}
          fullWidth
        />
      </View>
    </Screen>
  );
}

function TaskRow({ task, onToggle }: { task: TaskItem; onToggle: () => void }): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(task.priority);

  return (
    <Pressable
      style={({ pressed }) => [
        styles.taskRow,
        {
          backgroundColor: theme.surface,
          borderColor: task.selected ? Colors.primary500 : theme.outline,
        },
        pressed && { opacity: 0.7 },
      ]}
      onPress={onToggle}
    >
      <View
        style={[
          styles.checkbox,
          { borderColor: task.selected ? Colors.primary500 : theme.outline },
          task.selected && { backgroundColor: Colors.primary500 },
        ]}
      >
        {task.selected && <View style={styles.checkFill} />}
      </View>

      <View style={styles.taskContent}>
        <Text style={[styles.taskTitle, { color: theme.onSurface }]} numberOfLines={2}>
          {task.title}
        </Text>

        <View style={styles.taskMeta}>
          <PriorityChip priority={task.priority} />
          {task.dueDate ? (
            <Text style={[styles.dueBadge, { color: priorityColor }]}>
              {formatDue(task.dueDate)}
            </Text>
          ) : null}
          {!task.assignedToMe && (
            <Text
              style={[
                styles.theirBadge,
                { color: theme.onSurfaceVariant, borderColor: theme.outline },
              ]}
            >
              Their action
            </Text>
          )}
        </View>

        {task.notes ? (
          <Text style={[styles.taskNotes, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
            {task.notes}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, gap: 16 },
  loadingTitle: { fontSize: 16, fontWeight: '700', marginTop: 8 },
  loadingHint: { fontSize: 13 },
  errorIcon: { fontSize: 32, marginBottom: 4 },
  errorText: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  emptyIcon: { fontSize: 40 },
  emptyTitle: { fontSize: 16, fontWeight: '700' },
  emptyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  callMetaCentered: { fontSize: 12, textAlign: 'center' },
  doneIcon: { fontSize: 48 },
  doneText: { fontSize: 18, fontWeight: '700' },
  headerSub: { fontSize: 13, paddingHorizontal: 20, paddingBottom: 8 },
  selectAllRow: { paddingHorizontal: 16, paddingVertical: 10 },
  selectAllText: { fontSize: 13, fontWeight: '600' },
  list: { paddingHorizontal: 12, paddingBottom: 8, gap: 8 },
  taskRow: {
    flexDirection: 'row',
    borderRadius: 16,
    borderWidth: 0.5,
    padding: 12,
    gap: 12,
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
    flexShrink: 0,
  },
  checkFill: { width: 8, height: 8, borderRadius: 2, backgroundColor: '#fff' },
  taskContent: { flex: 1, gap: 6 },
  taskTitle: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  taskMeta: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  dueBadge: { fontSize: 12, fontWeight: '600' },
  theirBadge: {
    fontSize: 11,
    fontWeight: '600',
    borderWidth: 0.5,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  taskNotes: { fontSize: 12, lineHeight: 18 },
  footer: { padding: 16, gap: 10, borderTopWidth: 0.5 },
  createBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnDisabled: { opacity: 0.5 },
  createBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
