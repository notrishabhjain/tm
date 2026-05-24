import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import NotificationListener from '../../modules/notification-listener/src';
import { runExtractionPipeline } from '@/domain/extraction';
import type { PipelineConfig } from '@/domain/extraction';
import type { Keyword } from '@/domain/extraction/ruleEngine';
import type { Priority } from '@/domain/types';
import seedKeywordsRaw from '../../assets/seed-keywords.json';

type RawKeyword = { keyword: string; language: string; priority_hint: string };

function priorityHintToCategory(hint: string): Keyword['category'] {
  if (hint === 'URGENT') return 'URGENCY';
  if (hint === 'HIGH') return 'IMPERATIVE';
  if (hint === 'MEDIUM') return 'IMPERATIVE';
  return 'ANTI_PATTERN';
}

const SEED_VOCABULARY: Keyword[] = (seedKeywordsRaw as RawKeyword[]).map((k) => ({
  phrase: k.keyword,
  category: priorityHintToCategory(k.priority_hint),
  language: k.language as Keyword['language'],
  weight: k.priority_hint === 'URGENT' ? 1.5 : k.priority_hint === 'HIGH' ? 1.2 : 1.0,
}));

const PIPELINE_CONFIG: PipelineConfig = {
  vocabulary: SEED_VOCABULARY,
  vipSenders: [],
  ruleWeight: 1.0,
  modelWeight: 0.0,
};

const taskRepo = new TaskRepository(db);

interface ParsedShare {
  sender: string;
  message: string;
  timestamp: string;
  rawText: string;
}

function parseWhatsAppShare(text: string): ParsedShare {
  const waPattern =
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\]\s+([^:]+):\s+([\s\S]+)$/i;
  const match = waPattern.exec(text.trim());
  if (match) {
    return {
      sender: match[2].trim(),
      message: match[3].trim(),
      timestamp: match[1].trim(),
      rawText: text,
    };
  }
  return {
    sender: '',
    message: text.trim(),
    timestamp: new Date().toLocaleString(),
    rawText: text,
  };
}

function formatDueDate(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const diffDays = Math.floor((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return 'Overdue';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
}

export default function ShareScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  const [parsed, setParsed] = useState<ParsedShare | null>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadShare();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShare = async (): Promise<void> => {
    try {
      const intent = await NotificationListener.peekShareIntent();

      if (!intent?.text) {
        setError('Nothing was shared. Please use the Android share menu to share a message.');
        setLoading(false);
        return;
      }

      const rawText = intent.text;
      const p = parseWhatsAppShare(rawText);
      const effectiveSender = p.sender || (intent.subject ?? '');
      const effectiveParsed = { ...p, sender: effectiveSender };
      setParsed(effectiveParsed);

      if (rawText) {
        const pipelineResult = await runExtractionPipeline(
          { text: effectiveParsed.message, title: effectiveSender || undefined },
          PIPELINE_CONFIG
        );
        const suggestedTitle =
          pipelineResult.extractedTitle ||
          (effectiveSender
            ? `${effectiveSender}: ${effectiveParsed.message.slice(0, 60)}`
            : effectiveParsed.message.slice(0, 80));
        setTitle(suggestedTitle);
        setPriority(pipelineResult.priority);
        if (pipelineResult.dueDate) setDueDate(pipelineResult.dueDate);
      }
    } catch {
      setError('Could not read shared content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    if (!parsed || !title.trim()) return;
    setSaving(true);
    try {
      await taskRepo.createTask({
        title: title.trim(),
        body: parsed.message || parsed.rawText,
        sourceApp: 'manual.share',
        sender: parsed.sender || undefined,
        priority,
        confidence: 0.9,
        needsConfirmation: false,
        matchedKeywords: ['shared_message'],
        language: 'EN',
        dueDate,
      });
      await NotificationListener.clearShareIntent().catch(() => null);
      router.replace('/(tabs)/');
    } catch {
      setError('Failed to create task. Please try again.');
      setSaving(false);
    }
  };

  const handleDiscard = async (): Promise<void> => {
    await NotificationListener.clearShareIntent().catch(() => null);
    router.replace('/(tabs)/');
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={Colors.primary500} size="large" />
        <Text style={[styles.loadingText, { color: theme.onSurfaceVariant }]}>
          Analysing shared message…
        </Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={styles.errorText}>{error}</Text>
        <Button label="Go to Home" onPress={() => void handleDiscard()} variant="secondary" />
      </View>
    );
  }

  const priorityColor = getPriorityColor(priority);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { borderBottomColor: priorityColor, backgroundColor: theme.surface },
        ]}
      >
        <Text style={[styles.headerTitle, { color: theme.primary }]}>Create Task</Text>
        <PriorityChip priority={priority} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {parsed?.sender ? (
          <View style={[styles.metaCard, { backgroundColor: theme.surface }]}>
            <View style={styles.metaRow}>
              <Text style={[styles.metaLabel, { color: theme.onSurfaceVariant }]}>From</Text>
              <Text style={[styles.metaValue, { color: theme.onSurface }]}>{parsed.sender}</Text>
            </View>
            {parsed.timestamp ? (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: theme.onSurfaceVariant }]}>Time</Text>
                <Text style={[styles.metaValue, { color: theme.onSurface }]}>
                  {parsed.timestamp}
                </Text>
              </View>
            ) : null}
            {dueDate ? (
              <View style={styles.metaRow}>
                <Text style={[styles.metaLabel, { color: theme.onSurfaceVariant }]}>Due</Text>
                <Text style={[styles.metaValue, { color: getPriorityColor('URGENT') }]}>
                  {formatDueDate(dueDate)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        <Text style={[styles.fieldLabel, { color: theme.onSurfaceVariant }]}>Task</Text>
        <TextInput
          style={[
            styles.titleInput,
            { backgroundColor: theme.surface, color: theme.onSurface, borderColor: theme.outline },
          ]}
          value={title}
          onChangeText={setTitle}
          multiline
          placeholder="Describe the task…"
          placeholderTextColor={theme.onSurfaceVariant}
          autoFocus
        />

        <Text style={[styles.fieldLabel, { color: theme.onSurfaceVariant }]}>Original Message</Text>
        <View style={[styles.messageBox, { backgroundColor: theme.pressHighlight }]}>
          <Text style={[styles.messageText, { color: theme.onSurface }]}>{parsed?.message}</Text>
        </View>
      </ScrollView>

      <View
        style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outline }]}
      >
        <Pressable
          style={[styles.createBtn, { backgroundColor: priorityColor }, saving && styles.disabled]}
          onPress={() => void handleCreate()}
          disabled={saving}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>Create Task</Text>
          )}
        </Pressable>
        <Button
          label="Discard"
          variant="secondary"
          onPress={() => void handleDiscard()}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    padding: 24,
  },
  loadingText: { fontSize: 14 },
  errorText: { fontSize: 14, color: Colors.error, textAlign: 'center', marginBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    borderBottomWidth: 3,
  },
  headerTitle: { fontSize: 20, fontWeight: '700' },
  content: { padding: 16, gap: 12 },
  metaCard: {
    borderRadius: 10,
    padding: 12,
    elevation: 1,
    gap: 4,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metaValue: { fontSize: 14, fontWeight: '500' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginLeft: 2,
    marginBottom: 4,
  },
  titleInput: {
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    borderWidth: 1,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  messageBox: {
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary300,
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  footer: {
    padding: 16,
    gap: 10,
    borderTopWidth: 1,
  },
  createBtn: {
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  disabled: { opacity: 0.6 },
});
