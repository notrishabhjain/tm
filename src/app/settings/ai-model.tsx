import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { Button } from '@/ui/components/Button';
import { downloadModel, deleteModel, getModelInfo, type ModelInfo } from '@/services/model-manager';
import { getSetting, setSetting } from '@/data/storage/settings';

const POSITIVE_SIGNALS = [
  { label: 'Imperative verb (EN)', weight: '+0.45' },
  { label: 'Imperative verb (HI/Hinglish)', weight: '+0.35' },
  { label: 'Deadline expression', weight: '+0.35' },
  { label: 'Question to recipient', weight: '+0.30' },
  { label: 'Action keyword match', weight: '+0.25' },
  { label: 'Polite request', weight: '+0.20' },
  { label: 'Thread context boost', weight: '+0.15' },
  { label: 'Confirmation request', weight: '+0.12' },
  { label: 'Learned n-gram match', weight: '+0.05 – +0.15' },
  { label: 'App profile boost (email)', weight: '+0.08' },
];

const NEGATIVE_SIGNALS = [
  { label: 'OTP / verification code', weight: 'DISCARD' },
  { label: 'Transaction / payment alert', weight: 'DISCARD' },
  { label: 'Shipment / delivery update', weight: 'DISCARD' },
  { label: 'Promotional / marketing', weight: 'DISCARD' },
  { label: 'News / sports headline', weight: 'DISCARD' },
  { label: 'Negated action', weight: '−0.40' },
  { label: 'Self-completed update', weight: '−0.35' },
  { label: 'Auto-reply / OOO', weight: '−0.45' },
  { label: 'Social / low-signal app', weight: '−0.15' },
];

export default function AiModelScreen(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const [modelInfo, setModelInfo] = useState<ModelInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modelWeight, setModelWeightState] = useState<number>(getSetting('model_weight'));

  const refresh = useCallback(async () => {
    const info = await getModelInfo();
    setModelInfo(info);
    setModelWeightState(getSetting('model_weight'));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    setProgress(0);
    setError(null);
    try {
      await downloadModel({
        onProgress: (f) => setProgress(f),
      });
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  }, [refresh]);

  const handleDelete = useCallback(async () => {
    await deleteModel();
    await refresh();
  }, [refresh]);

  const toggleModel = useCallback(() => {
    const next = modelWeight > 0 ? 0 : 0.3;
    setSetting('model_weight', next);
    setSetting('model_weight_user_set', true);
    setModelWeightState(next);
  }, [modelWeight]);

  const modelActive = modelWeight > 0 && modelInfo != null && modelInfo.source !== 'none';

  return (
    <Screen>
      <LargeHeader title="Signal Engine" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Rule engine card */}
        <View
          style={[styles.heroCard, { backgroundColor: theme.surface, borderColor: theme.outline }]}
        >
          <Text style={[styles.heroTitle, { color: theme.onSurface }]}>
            Rule engine · always active
          </Text>
          <Text style={[styles.heroDesc, { color: theme.onSurfaceVariant }]}>
            A deterministic signal scorer tuned on real notification patterns. Runs entirely
            on-device — zero network calls, zero RAM overhead.
          </Text>
          <View style={styles.statsRow}>
            <View style={[styles.statPill, { backgroundColor: theme.surfaceVariant }]}>
              <Text style={[styles.statPillNum, { color: theme.primary }]}>52+</Text>
              <Text style={[styles.statPillLabel, { color: theme.onSurfaceVariant }]}>
                patterns
              </Text>
            </View>
            <View style={[styles.statPill, { backgroundColor: theme.surfaceVariant }]}>
              <Text style={[styles.statPillNum, { color: theme.primary }]}>5</Text>
              <Text style={[styles.statPillLabel, { color: theme.onSurfaceVariant }]}>
                sender tiers
              </Text>
            </View>
            <View style={[styles.statPill, { backgroundColor: theme.surfaceVariant }]}>
              <Text style={[styles.statPillNum, { color: theme.primary }]}>0ms</Text>
              <Text style={[styles.statPillLabel, { color: theme.onSurfaceVariant }]}>
                cold start
              </Text>
            </View>
          </View>
        </View>

        {/* Local model card */}
        <View
          style={[styles.modelCard, { backgroundColor: theme.surface, borderColor: theme.outline }]}
        >
          <View style={styles.modelHeader}>
            <View>
              <Text style={[styles.modelTitle, { color: theme.onSurface }]}>
                Local intent model
              </Text>
              <Text style={[styles.modelSub, { color: theme.onSurfaceVariant }]}>
                {modelInfo
                  ? modelInfo.source === 'downloaded'
                    ? `v${modelInfo.version} · ${modelInfo.weightCount.toLocaleString()} weights · updated`
                    : modelInfo.source === 'seed'
                      ? `v${modelInfo.version} · ${modelInfo.weightCount} active weights · bundled`
                      : 'Not loaded'
                  : 'Loading…'}
              </Text>
            </View>
            {modelInfo && modelInfo.source !== 'none' && (
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: modelActive ? Colors.success : theme.onSurfaceVariant,
                  },
                ]}
              />
            )}
          </View>

          <Text style={[styles.modelDesc, { color: theme.onSurfaceVariant }]}>
            A logistic regression classifier trained on labeled notification data. Acts as a
            semantic second opinion on top of the rule engine — fully offline, ~50 KB.
          </Text>

          {error && (
            <Pressable
              style={({ pressed }) => [
                styles.errorBanner,
                { backgroundColor: Colors.highBgLight, borderColor: Colors.highFg },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => setError(null)}
              accessibilityRole="button"
              accessibilityLabel="Dismiss error"
            >
              <Text style={[styles.errorText, { color: Colors.highFg }]}>
                {error.includes('not a valid model') || error.includes('invalid response')
                  ? 'No update available — built-in model is active'
                  : error}
              </Text>
              <Text style={[styles.errorDismiss, { color: Colors.highFg }]}>✕ tap to dismiss</Text>
            </Pressable>
          )}

          {downloading && (
            <View style={styles.progressRow}>
              <View style={[styles.progressTrack, { backgroundColor: theme.outline }]}>
                <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
              </View>
              <Text style={[styles.progressLabel, { color: theme.onSurfaceVariant }]}>
                {Math.round(progress * 100)}%
              </Text>
            </View>
          )}

          <View style={styles.modelActions}>
            {/* Seed always provides a base; download replaces it with an improved version */}
            <Button
              variant="secondary"
              label={modelInfo?.source === 'downloaded' ? 'Re-download' : 'Update model'}
              loading={downloading}
              onPress={() => void handleDownload()}
              style={styles.actionBtn}
            />
            {modelInfo?.source === 'downloaded' ? (
              <Button
                variant="destructive"
                label="Delete downloaded"
                onPress={() => void handleDelete()}
                style={styles.actionBtn}
              />
            ) : null}
            <Button
              variant={modelActive ? 'secondary' : 'primary'}
              label={modelActive ? 'Disable model' : 'Enable model'}
              onPress={toggleModel}
              style={styles.actionBtn}
            />
          </View>

          {modelInfo && modelInfo.source !== 'none' && (
            <Text style={[styles.weightNote, { color: theme.onSurfaceVariant }]}>
              {modelActive
                ? `Active · ${Math.round(modelWeight * 100)}% model / ${Math.round((1 - modelWeight) * 100)}% rules`
                : 'Disabled — tap Enable to activate'}
            </Text>
          )}
        </View>

        {/* Positive signals table */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
          Positive signals
        </Text>
        <View
          style={[styles.table, { backgroundColor: theme.surface, borderColor: theme.outline }]}
        >
          {POSITIVE_SIGNALS.map((s, i) => (
            <View
              key={s.label}
              style={[
                styles.tableRow,
                i > 0 && [styles.tableRowBorder, { borderTopColor: theme.outline }],
              ]}
            >
              <Text style={[styles.tableLabel, { color: theme.onSurface }]}>{s.label}</Text>
              <Text style={[styles.tableWeight, { color: Colors.success }]}>{s.weight}</Text>
            </View>
          ))}
        </View>

        {/* Negative signals table */}
        <Text style={[styles.sectionLabel, { marginTop: 16, color: theme.onSurfaceVariant }]}>
          Negative signals
        </Text>
        <View
          style={[styles.table, { backgroundColor: theme.surface, borderColor: theme.outline }]}
        >
          {NEGATIVE_SIGNALS.map((s, i) => (
            <View
              key={s.label}
              style={[
                styles.tableRow,
                i > 0 && [styles.tableRowBorder, { borderTopColor: theme.outline }],
              ]}
            >
              <Text style={[styles.tableLabel, { color: theme.onSurface }]}>{s.label}</Text>
              <Text
                style={[
                  styles.tableWeight,
                  { color: s.weight === 'DISCARD' ? Colors.urgentFg : Colors.highFg },
                ]}
              >
                {s.weight}
              </Text>
            </View>
          ))}
        </View>

        <Text style={[styles.footnote, { color: theme.onSurfaceVariant }]}>
          Self-learning via sender stats and n-gram feedback. Each confirmation/rejection refines
          future scoring.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 8 },

  heroCard: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 20,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 8,
  },
  heroDesc: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  statPill: {
    flex: 1,
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
  },
  statPillNum: { fontSize: 18, fontWeight: '700' },
  statPillLabel: {
    fontSize: 10,
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '500',
  },

  modelCard: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    marginTop: 8,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modelTitle: { fontSize: 15, fontWeight: '600' },
  modelSub: {
    fontSize: 11,
    marginTop: 2,
    fontWeight: '500',
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  modelDesc: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 14,
  },
  errorBanner: {
    borderRadius: 12,
    borderWidth: 0.5,
    padding: 10,
    marginBottom: 10,
  },
  errorText: { fontSize: 12, fontWeight: '600' },
  errorDismiss: { fontSize: 10, marginTop: 4, fontWeight: '500' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: Colors.primary500, borderRadius: 3 },
  progressLabel: {
    fontSize: 11,
    fontWeight: '600',
    width: 32,
  },
  modelActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    height: 44,
    paddingHorizontal: 16,
    minWidth: 120,
  },
  weightNote: {
    fontSize: 11,
    marginTop: 10,
    fontWeight: '500',
  },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  table: {
    borderWidth: 0.5,
    borderRadius: 16,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    justifyContent: 'space-between',
  },
  tableRowBorder: { borderTopWidth: 0.5 },
  tableLabel: { fontSize: 13, flex: 1, fontWeight: '500' },
  tableWeight: { fontSize: 12, fontWeight: '600', marginLeft: 8 },
  footnote: {
    fontSize: 12,
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
