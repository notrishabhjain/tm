import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { runExtractionPipeline } from '@/domain/extraction';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import seedKeywordsRaw from '../../../assets/seed-keywords.json';
import type { Keyword } from '@/domain/extraction/ruleEngine';
import type { Priority } from '@/domain/types';

const taskRepo = new TaskRepository(db);

type RawKeyword = { keyword: string; language: string; priority_hint: string };
const SEED_VOCAB: Keyword[] = (seedKeywordsRaw as RawKeyword[]).map((k) => ({
  phrase: k.keyword,
  category: (k.priority_hint === 'URGENT'
    ? 'URGENCY'
    : k.priority_hint === 'LOW'
      ? 'ANTI_PATTERN'
      : 'IMPERATIVE') as Keyword['category'],
  language: k.language as Keyword['language'],
  weight: k.priority_hint === 'URGENT' ? 1.5 : k.priority_hint === 'HIGH' ? 1.2 : 1.0,
}));

interface Candidate {
  id: string;
  sentence: string;
  score: number;
  priority: Priority;
  selected: boolean;
}

function segmentSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।\n])\s+|(?<=\n)\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.split(/\s+/).length >= 3);
}

const MIN_DISPLAY_SCORE = 0.25;
const MAX_SENTENCES = 150;
const DEPTH = 4;

export default function TranscriptImportScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [rawText, setRawText] = useState('');
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<'input' | 'review'>('input');

  const handlePaste = async (): Promise<void> => {
    const text = await Clipboard.getStringAsync();
    if (text) setRawText(text);
    else Alert.alert('Clipboard empty', 'Nothing found in the clipboard.');
  };

  const handleAnalyze = async (): Promise<void> => {
    if (!rawText.trim()) return;
    setAnalyzing(true);
    try {
      const sentences = segmentSentences(rawText).slice(0, MAX_SENTENCES);
      if (sentences.length === 0) {
        Alert.alert(
          'No sentences found',
          'The text could not be segmented. Make sure it has proper sentence breaks.'
        );
        setAnalyzing(false);
        return;
      }

      const results = await Promise.all(
        sentences.map(async (sentence, i) => {
          const result = await runExtractionPipeline(
            { text: sentence, sourceApp: 'transcript' },
            { vocabulary: SEED_VOCAB, vipSenders: [], ruleWeight: 1.0, modelWeight: 0.0 }
          );

          return {
            id: `${Date.now()}-${i}`,
            sentence,
            score: result.confidence,
            priority: result.priority,
            selected: result.confidence >= 0.4,
          } satisfies Candidate;
        })
      );

      const visible = results
        .filter((c) => c.score >= MIN_DISPLAY_SCORE)
        .sort((a, b) => b.score - a.score);

      if (visible.length === 0) {
        Alert.alert(
          'No tasks found',
          'No actionable sentences were detected. Try a text with clear action requests.'
        );
        setAnalyzing(false);
        return;
      }

      setCandidates(visible);
      setStep('review');
    } catch (err) {
      Alert.alert('Analysis failed', String(err));
    } finally {
      setAnalyzing(false);
    }
  };

  const toggleSelect = (id: string): void => {
    setCandidates((prev) => prev.map((c) => (c.id === id ? { ...c, selected: !c.selected } : c)));
  };

  const handleSave = async (): Promise<void> => {
    const selected = candidates.filter((c) => c.selected);
    if (selected.length === 0) {
      Alert.alert('Nothing selected', 'Select at least one task to save.');
      return;
    }
    setSaving(true);
    try {
      for (const c of selected) {
        await taskRepo.createTask({
          title: c.sentence.slice(0, 120),
          body: c.sentence,
          sourceApp: 'transcript',
          priority: c.priority,
          confidence: c.score,
          ruleScore: c.score,
          language: 'EN',
          matchedKeywords: [],
          needsConfirmation: c.score < 0.75,
        });
      }
      const target = selected.some((c) => c.score < 0.75) ? '/(tabs)/confirmations' : '/(tabs)';
      Alert.alert(
        'Tasks saved',
        `${selected.length} task${selected.length !== 1 ? 's' : ''} created.`,
        [{ text: 'OK', onPress: () => router.replace(target) }]
      );
    } catch (err) {
      Alert.alert('Save failed', String(err));
      setSaving(false);
    }
  };

  const selectedCount = candidates.filter((c) => c.selected).length;

  if (step === 'review') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={styles.header}>
          <Pressable
            onPress={() => setStep('input')}
            style={styles.backBtn}
            accessibilityRole="button"
          >
            <Text style={styles.backText}>Back</Text>
          </Pressable>
          <Text style={styles.title}>Review Tasks</Text>
          <View style={{ width: 56 }} />
        </View>

        <View
          style={[
            styles.reviewBanner,
            { backgroundColor: theme.surface, borderBottomColor: theme.outline },
          ]}
        >
          <Text style={[styles.reviewBannerText, { color: theme.onSurfaceVariant }]}>
            {candidates.length} found · {selectedCount} selected
          </Text>
          <Pressable
            onPress={() =>
              setCandidates((prev) =>
                prev.map((c) => ({ ...c, selected: selectedCount < prev.length }))
              )
            }
          >
            <Text style={[styles.selectAllText, { color: theme.primary }]}>
              {selectedCount < candidates.length ? 'Select all' : 'Deselect all'}
            </Text>
          </Pressable>
        </View>

        <FlatList
          data={candidates}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.reviewList}
          renderItem={({ item }) => (
            <CandidateRow candidate={item} onToggle={() => toggleSelect(item.id)} />
          )}
        />

        <View
          style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outline }]}
        >
          <Button
            label={
              saving ? 'Saving...' : `Save ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`
            }
            variant="primary"
            onPress={() => void handleSave()}
            loading={saving}
            fullWidth
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Analyze Text</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.inputContent} keyboardShouldPersistTaps="handled">
        <Text style={[styles.inputHint, { color: theme.onSurfaceVariant }]}>
          Paste a meeting transcript, email thread, or any long text. TaskMind will extract
          actionable tasks from it using the on-device signal engine.
        </Text>

        <View style={[styles.textAreaWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.textAreaShadow} />
          <View style={[styles.textAreaBorder, { backgroundColor: theme.surface }]}>
            <TextInput
              style={[styles.textArea, { color: theme.onSurface }]}
              value={rawText}
              onChangeText={setRawText}
              multiline
              placeholder="Paste your text here..."
              placeholderTextColor={theme.onSurfaceVariant}
              textAlignVertical="top"
            />
            {rawText.length > 0 && (
              <Text style={[styles.charCount, { color: theme.onSurfaceVariant }]}>
                {rawText.length} chars
              </Text>
            )}
          </View>
        </View>

        <View style={styles.inputActions}>
          <Button
            label="Paste from Clipboard"
            variant="secondary"
            onPress={() => void handlePaste()}
            style={styles.halfBtn}
          />
          <Button
            label={analyzing ? 'Analyzing...' : 'Analyze Text'}
            variant="primary"
            onPress={() => void handleAnalyze()}
            loading={analyzing}
            style={styles.halfBtn}
          />
        </View>

        {analyzing && (
          <View style={styles.analyzingRow}>
            <ActivityIndicator color={Colors.primary900} />
            <Text style={[styles.analyzingText, { color: theme.onSurfaceVariant }]}>
              Running signal extraction...
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function CandidateRow({
  candidate,
  onToggle,
}: {
  candidate: Candidate;
  onToggle: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  const priorityColor = getPriorityColor(candidate.priority);

  return (
    <View style={[styles.candidateWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
      <View
        style={[
          styles.candidateShadow,
          { backgroundColor: candidate.selected ? Colors.neoShadowDefault : theme.outline },
        ]}
      />
      <Pressable
        style={[
          styles.candidateRow,
          { backgroundColor: theme.surface, borderColor: theme.outline },
          candidate.selected && styles.candidateRowSelected,
        ]}
        onPress={onToggle}
      >
        <View
          style={[
            styles.checkbox,
            { borderColor: theme.outline },
            candidate.selected && styles.checkboxSelected,
          ]}
        >
          {candidate.selected && <View style={styles.checkmarkFill} />}
        </View>
        <View style={styles.candidateContent}>
          <Text style={[styles.candidateSentence, { color: theme.onSurface }]} numberOfLines={3}>
            {candidate.sentence}
          </Text>
          <View style={styles.candidateMeta}>
            <PriorityChip priority={candidate.priority} />
            <View style={[styles.scoreBadge, { backgroundColor: theme.outline }]}>
              <View
                style={[
                  styles.scoreBar,
                  {
                    width: `${Math.round(candidate.score * 100)}%`,
                    backgroundColor: priorityColor,
                  },
                ]}
              />
            </View>
            <Text style={[styles.scoreText, { color: theme.onSurfaceVariant }]}>
              {Math.round(candidate.score * 100)}%
            </Text>
          </View>
        </View>
      </Pressable>
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
  inputContent: { padding: 16, gap: 14, paddingBottom: 32 },
  inputHint: { fontSize: 13, lineHeight: 20 },
  textAreaWrapper: { position: 'relative' },
  textAreaShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  textAreaBorder: {
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    overflow: 'hidden',
  },
  textArea: {
    padding: 14,
    fontSize: 14,
    minHeight: 200,
    maxHeight: 400,
    textAlignVertical: 'top',
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 11,
  },
  inputActions: { flexDirection: 'row', gap: 10 },
  halfBtn: { flex: 1 },
  analyzingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
    paddingVertical: 8,
  },
  analyzingText: { fontSize: 13 },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
  },
  reviewBannerText: { fontSize: 12, flex: 1 },
  selectAllText: { fontSize: 13, fontWeight: '700' },
  reviewList: { padding: 12, gap: 8, paddingBottom: 16 },
  candidateWrapper: { position: 'relative' },
  candidateShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  candidateRow: {
    flexDirection: 'row',
    borderRadius: 2,
    padding: 12,
    gap: 12,
    borderWidth: 2,
  },
  candidateRowSelected: { borderColor: Colors.primary900 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 2,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary900,
    borderColor: Colors.primary900,
  },
  checkmarkFill: { width: 8, height: 8, borderRadius: 1, backgroundColor: Colors.white },
  candidateContent: { flex: 1, gap: 6 },
  candidateSentence: { fontSize: 13, lineHeight: 19 },
  candidateMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreBadge: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreBar: { height: '100%', borderRadius: 2 },
  scoreText: { fontSize: 11, width: 32, textAlign: 'right' },
  footer: {
    padding: 16,
    borderTopWidth: 2,
  },
});
