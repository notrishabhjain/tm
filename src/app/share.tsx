import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Image,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
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
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedShare | null>(null);
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [dueDate, setDueDate] = useState<number | null>(null);
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadShare();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShare = async (): Promise<void> => {
    try {
      const [intent, screenshot] = await Promise.all([
        NotificationListener.peekShareIntent(),
        NotificationListener.getLatestScreenshot(),
      ]);

      if (!intent?.text) {
        setError('No shared text found. Please try sharing again from WhatsApp.');
        setLoading(false);
        return;
      }

      if (screenshot) setScreenshotPath(screenshot);

      const p = parseWhatsAppShare(intent.text);
      // For accessibility-captured text, sender is stored in intent.subject
      const effectiveSender = p.sender || (intent.subject ?? '');
      const effectiveParsed = { ...p, sender: effectiveSender };
      setParsed(effectiveParsed);

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
        body: parsed.rawText,
        sourceApp: 'manual.capture',
        sender: parsed.sender || undefined,
        priority,
        confidence: 0.9,
        needsConfirmation: false,
        matchedKeywords: ['shared_message'],
        language: 'EN',
        dueDate,
      });
      // Clean up after task is created
      await Promise.allSettled([
        NotificationListener.clearShareIntent(),
        NotificationListener.clearLatestScreenshot(),
      ]);
      router.replace('/(tabs)/');
    } catch {
      setError('Failed to create task. Please try again.');
      setSaving(false);
    }
  };

  const handleDiscard = async (): Promise<void> => {
    await Promise.allSettled([
      NotificationListener.clearShareIntent(),
      NotificationListener.clearLatestScreenshot(),
    ]);
    router.replace('/(tabs)/');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary500} size="large" />
        <Text style={styles.loadingText}>Analysing shared message…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Button label="Go to Home" onPress={() => void handleDiscard()} variant="secondary" />
      </View>
    );
  }

  const priorityColor = getPriorityColor(priority);

  return (
    <View style={styles.container}>
      <View style={[styles.header, { borderBottomColor: priorityColor }]}>
        <Text style={styles.headerTitle}>Create Task</Text>
        <PriorityChip priority={priority} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Screenshot context image */}
        {screenshotPath ? (
          <View style={styles.screenshotCard}>
            <Text style={styles.screenshotLabel}>Context screenshot</Text>
            <Image
              source={{ uri: `file://${screenshotPath}` }}
              style={styles.screenshotImage}
              resizeMode="contain"
            />
          </View>
        ) : null}

        {/* Sender info */}
        {parsed?.sender ? (
          <View style={styles.metaCard}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>From</Text>
              <Text style={styles.metaValue}>{parsed.sender}</Text>
            </View>
            {parsed.timestamp ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Time</Text>
                <Text style={styles.metaValue}>{parsed.timestamp}</Text>
              </View>
            ) : null}
            {dueDate ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Due</Text>
                <Text style={[styles.metaValue, { color: getPriorityColor('URGENT') }]}>
                  {formatDueDate(dueDate)}
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}

        {/* Editable title */}
        <Text style={styles.fieldLabel}>Task</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          multiline
          placeholder="Describe the task…"
          placeholderTextColor={Colors.onSurfaceVariantLight}
          autoFocus
        />

        {/* Original message */}
        <Text style={styles.fieldLabel}>Original Message</Text>
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{parsed?.message}</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <Pressable
          style={[styles.createBtn, { backgroundColor: priorityColor }, saving && styles.disabled]}
          onPress={() => void handleCreate()}
          disabled={saving}
          accessibilityRole="button"
        >
          {saving ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <Text style={styles.createBtnText}>✓ Create Task</Text>
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
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.backgroundLight,
    padding: 24,
  },
  loadingText: { fontSize: 14, color: Colors.onSurfaceVariantLight },
  errorText: { fontSize: 14, color: Colors.error, textAlign: 'center', marginBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 14,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 3,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary900 },
  content: { padding: 16, gap: 12 },
  screenshotCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 10,
    elevation: 1,
  },
  screenshotLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  screenshotImage: {
    width: '100%',
    height: 180,
    borderRadius: 6,
    backgroundColor: Colors.surfaceVariantLight,
  },
  metaCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    elevation: 1,
    gap: 4,
  },
  metaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  metaValue: { fontSize: 14, color: Colors.onSurfaceLight, fontWeight: '500' },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginLeft: 2,
    marginBottom: 4,
  },
  titleInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.onSurfaceLight,
    borderWidth: 1,
    borderColor: Colors.outlineLight,
    minHeight: 60,
    textAlignVertical: 'top',
  },
  messageBox: {
    backgroundColor: Colors.primary50,
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary300,
  },
  messageText: { fontSize: 14, color: Colors.primary900, lineHeight: 20 },
  footer: {
    padding: 16,
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineLight,
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
