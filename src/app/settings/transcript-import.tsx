/**
 * F-11 — Meeting Transcript / Long Text Import
 *
 * Paste or share any long text (meeting notes, email thread, chat export, etc.).
 * The pipeline segments it into sentences, runs the full extraction engine on each
 * (including ONNX semantic scoring when the model is loaded), and presents a
 * reviewable list of candidate tasks. The user selects which ones to keep.
 */

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
import { Button } from '@/ui/components/Button';
import { PriorityChip } from '@/ui/components/PriorityChip';
import { runExtractionPipeline } from '@/domain/extraction';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import { isModelLoaded, classifyTaskProbability } from '@/services/onnx-classifier';
import { isLlmLoaded, extractTasksFromTranscript } from '@/services/llm-service';
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

// Split text into sentences, filtering blanks and very short fragments
function segmentSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।\n])\s+|(?<=\n)\s*\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15 && s.split(/\s+/).length >= 3);
}

const MIN_DISPLAY_SCORE = 0.25;
const MAX_SENTENCES = 150;

export default function TranscriptImportScreen(): React.JSX.Element {
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
      // LLM path — richer extraction when Qwen3 is loaded
      if (isLlmLoaded()) {
        const llmTasks = await extractTasksFromTranscript(rawText);
        if (llmTasks.length > 0) {
          const results: Candidate[] = llmTasks.map((t, i) => ({
            id: `${Date.now()}-${i}`,
            sentence: t.title,
            score: 0.85,
            priority: t.priority,
            selected: true,
          }));
          setCandidates(results);
          setStep('review');
          return;
        }
        // LLM returned empty — fall through to rule engine
      }

      // Rule engine path — sentence-by-sentence extraction
      const sentences = segmentSentences(rawText).slice(0, MAX_SENTENCES);
      if (sentences.length === 0) {
        Alert.alert(
          'No sentences found',
          'The text could not be segmented. Make sure it has proper sentence breaks.'
        );
        setAnalyzing(false);
        return;
      }

      const classifierAvailable = isModelLoaded();
      const modelWeight = classifierAvailable ? 0.35 : 0.0;

      const results = await Promise.all(
        sentences.map(async (sentence, i) => {
          const modelInferer = classifierAvailable
            ? () => classifyTaskProbability(sentence)
            : undefined;

          const result = await runExtractionPipeline(
            { text: sentence, sourceApp: 'transcript' },
            {
              vocabulary: SEED_VOCAB,
              vipSenders: [],
              ruleWeight: 1.0 - modelWeight,
              modelWeight,
              modelInferer,
            }
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
      <View style={styles.container}>
        <View style={styles.header}>
          <Pressable onPress={() => setStep('input')} style={styles.backButton}>
            <Text style={styles.backText}>‹ Back</Text>
          </Pressable>
          <Text style={styles.title}>Review Tasks</Text>
          <View style={{ width: 60 }} />
        </View>

        <View style={styles.reviewBanner}>
          <Text style={styles.reviewBannerText}>
            {candidates.length} candidates found · {selectedCount} selected
            {isLlmLoaded() ? ' · LLM active' : isModelLoaded() ? ' · AI scoring active' : ''}
          </Text>
          <Pressable
            onPress={() =>
              setCandidates((prev) =>
                prev.map((c) => ({ ...c, selected: selectedCount < prev.length }))
              )
            }
          >
            <Text style={styles.selectAllText}>
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

        <View style={styles.footer}>
          <Button
            label={
              saving ? 'Saving…' : `Save ${selectedCount} Task${selectedCount !== 1 ? 's' : ''}`
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
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
        <Text style={styles.title}>Analyze Text</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.inputContent} keyboardShouldPersistTaps="handled">
        <Text style={styles.inputHint}>
          Paste a meeting transcript, email thread, or any long text. TaskMind will extract
          actionable tasks from it.
          {isLlmLoaded() ? ' Qwen3 LLM active.' : isModelLoaded() ? ' AI classifier active.' : ''}
        </Text>

        <View style={styles.textAreaWrapper}>
          <TextInput
            style={styles.textArea}
            value={rawText}
            onChangeText={setRawText}
            multiline
            placeholder="Paste your text here…"
            placeholderTextColor={Colors.onSurfaceVariantLight}
            textAlignVertical="top"
          />
          {rawText.length > 0 && <Text style={styles.charCount}>{rawText.length} chars</Text>}
        </View>

        <View style={styles.inputActions}>
          <Button
            label="Paste from Clipboard"
            variant="secondary"
            onPress={() => void handlePaste()}
            style={styles.halfBtn}
          />
          <Button
            label={analyzing ? 'Analyzing…' : 'Analyze Text'}
            variant="primary"
            onPress={() => void handleAnalyze()}
            loading={analyzing}
            style={styles.halfBtn}
          />
        </View>

        {analyzing && (
          <View style={styles.analyzingRow}>
            <ActivityIndicator color={Colors.primary500} />
            <Text style={styles.analyzingText}>
              {isLlmLoaded()
                ? 'Running Qwen3 LLM extraction…'
                : `Running extraction pipeline${isModelLoaded() ? ' + AI scoring' : ''}…`}
            </Text>
          </View>
        )}

        {!isLlmLoaded() && (
          <View style={styles.modelHint}>
            <Text style={styles.modelHintText}>
              {isModelLoaded()
                ? 'Download Qwen3 LLM in Settings → AI Models for richer task extraction.'
                : 'Download AI models in Settings → AI Models for better accuracy.'}
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
  const priorityColor = getPriorityColor(candidate.priority);

  return (
    <Pressable
      style={[styles.candidateRow, candidate.selected && styles.candidateRowSelected]}
      onPress={onToggle}
    >
      <View style={[styles.checkbox, candidate.selected && styles.checkboxSelected]}>
        {candidate.selected && <Text style={styles.checkmark}>✓</Text>}
      </View>
      <View style={styles.candidateContent}>
        <Text style={styles.candidateSentence} numberOfLines={3}>
          {candidate.sentence}
        </Text>
        <View style={styles.candidateMeta}>
          <PriorityChip priority={candidate.priority} />
          <View style={styles.scoreBadge}>
            <View
              style={[
                styles.scoreBar,
                { width: `${Math.round(candidate.score * 100)}%`, backgroundColor: priorityColor },
              ]}
            />
          </View>
          <Text style={styles.scoreText}>{Math.round(candidate.score * 100)}%</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 16, color: Colors.primary500, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.onSurfaceLight },
  inputContent: { padding: 16, gap: 14, paddingBottom: 32 },
  inputHint: { fontSize: 13, color: Colors.onSurfaceVariantLight, lineHeight: 20 },
  textAreaWrapper: { position: 'relative' },
  textArea: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 14,
    fontSize: 14,
    color: Colors.onSurfaceLight,
    borderWidth: 1,
    borderColor: Colors.outlineLight,
    minHeight: 200,
    maxHeight: 400,
    textAlignVertical: 'top',
  },
  charCount: {
    position: 'absolute',
    bottom: 8,
    right: 12,
    fontSize: 11,
    color: Colors.onSurfaceVariantLight,
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
  analyzingText: { fontSize: 13, color: Colors.onSurfaceVariantLight },
  modelHint: {
    backgroundColor: Colors.surfaceVariantLight,
    borderRadius: 8,
    padding: 12,
  },
  modelHintText: { fontSize: 12, color: Colors.onSurfaceVariantLight, lineHeight: 18 },
  reviewBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    paddingHorizontal: 16,
    backgroundColor: Colors.surfaceVariantLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  reviewBannerText: { fontSize: 12, color: Colors.onSurfaceVariantLight, flex: 1 },
  selectAllText: { fontSize: 13, color: Colors.primary500, fontWeight: '500' },
  reviewList: { padding: 12, gap: 8, paddingBottom: 16 },
  candidateRow: {
    flexDirection: 'row',
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    gap: 12,
    elevation: 1,
    borderWidth: 2,
    borderColor: Colors.transparent,
  },
  candidateRowSelected: { borderColor: Colors.primary500 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.outlineLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 2,
  },
  checkboxSelected: {
    backgroundColor: Colors.primary500,
    borderColor: Colors.primary500,
  },
  checkmark: { fontSize: 13, color: Colors.white, fontWeight: '700' },
  candidateContent: { flex: 1, gap: 6 },
  candidateSentence: { fontSize: 13, color: Colors.onSurfaceLight, lineHeight: 19 },
  candidateMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scoreBadge: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.outlineLight,
    borderRadius: 2,
    overflow: 'hidden',
  },
  scoreBar: { height: '100%', borderRadius: 2 },
  scoreText: { fontSize: 11, color: Colors.onSurfaceVariantLight, width: 32, textAlign: 'right' },
  footer: {
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineLight,
  },
});
