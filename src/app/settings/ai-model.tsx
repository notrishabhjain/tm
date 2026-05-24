import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { downloadModel, deleteModel, getModelInfo, type ModelInfo } from '@/services/model-manager';
import { getSetting, setSetting } from '@/data/storage/settings';

const DEPTH = 4;

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
    setModelWeightState(next);
  }, [modelWeight]);

  const modelActive = modelWeight > 0 && modelInfo != null && modelInfo.source !== 'none';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Signal Engine</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Rule engine card */}
        <View style={[styles.heroWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.heroShadow} />
          <View style={styles.heroCard}>
            <Text style={styles.heroTitle}>Rule engine · always active</Text>
            <Text style={styles.heroDesc}>
              A deterministic signal scorer tuned on real notification patterns. Runs entirely
              on-device — zero network calls, zero RAM overhead.
            </Text>
            <View style={styles.statsRow}>
              <View style={styles.statPill}>
                <Text style={styles.statPillNum}>52+</Text>
                <Text style={styles.statPillLabel}>patterns</Text>
              </View>
              <View style={styles.statPill}>
                <Text style={styles.statPillNum}>5</Text>
                <Text style={styles.statPillLabel}>sender tiers</Text>
              </View>
              <View style={styles.statPill}>
                <Text style={styles.statPillNum}>0ms</Text>
                <Text style={styles.statPillLabel}>cold start</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Local model card */}
        <View style={[styles.modelWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.modelShadow} />
          <View style={styles.modelCard}>
            <View style={styles.modelHeader}>
              <View>
                <Text style={styles.modelTitle}>Local intent model</Text>
                <Text style={styles.modelSub}>
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
                      backgroundColor: modelActive ? Colors.success : Colors.onSurfaceVariantLight,
                    },
                  ]}
                />
              )}
            </View>

            <Text style={styles.modelDesc}>
              A logistic regression classifier trained on labeled notification data. Acts as a
              semantic second opinion on top of the rule engine — fully offline, ~50 KB.
            </Text>

            {error && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {downloading && (
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View
                    style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]}
                  />
                </View>
                <Text style={styles.progressLabel}>{Math.round(progress * 100)}%</Text>
              </View>
            )}

            <View style={styles.modelActions}>
              {/* Seed always provides a base; download replaces it with an improved version */}
              <Pressable
                onPress={() => void handleDownload()}
                style={[styles.actionBtn, styles.actionBtnSecondary]}
                disabled={downloading}
                accessibilityRole="button"
              >
                {downloading ? (
                  <ActivityIndicator size="small" color={Colors.onSurfaceLight} />
                ) : (
                  <Text style={styles.actionBtnSecondaryText}>
                    {modelInfo?.source === 'downloaded' ? 'Re-download' : 'Update model'}
                  </Text>
                )}
              </Pressable>
              {modelInfo?.source === 'downloaded' ? (
                <Pressable
                  onPress={() => void handleDelete()}
                  style={[styles.actionBtn, styles.actionBtnDestructive]}
                  accessibilityRole="button"
                >
                  <Text style={styles.actionBtnDestructiveText}>Delete downloaded</Text>
                </Pressable>
              ) : null}
              <Pressable
                onPress={toggleModel}
                style={[
                  styles.actionBtn,
                  modelActive ? styles.actionBtnSecondary : styles.actionBtnPrimary,
                ]}
                accessibilityRole="button"
              >
                <Text
                  style={modelActive ? styles.actionBtnSecondaryText : styles.actionBtnPrimaryText}
                >
                  {modelActive ? 'Disable model' : 'Enable model'}
                </Text>
              </Pressable>
            </View>

            {modelInfo && modelInfo.source !== 'none' && (
              <Text style={styles.weightNote}>
                {modelActive
                  ? `Active · ${Math.round(modelWeight * 100)}% model / ${Math.round((1 - modelWeight) * 100)}% rules`
                  : 'Disabled — tap Enable to activate'}
              </Text>
            )}
          </View>
        </View>

        {/* Positive signals table */}
        <Text style={styles.sectionLabel}>POSITIVE SIGNALS</Text>
        <View style={[styles.tableWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.tableShadow} />
          <View style={styles.table}>
            {POSITIVE_SIGNALS.map((s, i) => (
              <View key={s.label} style={[styles.tableRow, i > 0 && styles.tableRowBorder]}>
                <Text style={styles.tableLabel}>{s.label}</Text>
                <Text style={[styles.tableWeight, { color: Colors.success }]}>{s.weight}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Negative signals table */}
        <Text style={[styles.sectionLabel, { marginTop: 16 }]}>NEGATIVE SIGNALS</Text>
        <View style={[styles.tableWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={[styles.tableShadow, { backgroundColor: Colors.neoShadowUrgent }]} />
          <View style={[styles.table, { borderColor: Colors.urgentFg }]}>
            {NEGATIVE_SIGNALS.map((s, i) => (
              <View key={s.label} style={[styles.tableRow, i > 0 && styles.tableRowBorder]}>
                <Text style={styles.tableLabel}>{s.label}</Text>
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
        </View>

        <Text style={styles.footnote}>
          Self-learning via sender stats and n-gram feedback. Each confirmation/rejection refines
          future scoring.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
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
  content: { padding: 16, paddingBottom: 40, gap: 8 },

  heroWrapper: { position: 'relative' },
  heroShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  heroCard: {
    backgroundColor: Colors.primary900,
    borderWidth: 2,
    borderColor: Colors.black,
    borderRadius: 2,
    padding: 20,
  },
  heroTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: Colors.white,
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  heroDesc: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 20,
    marginBottom: 16,
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  statPill: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 2,
    padding: 10,
    alignItems: 'center',
  },
  statPillNum: { fontSize: 18, fontWeight: '800', color: Colors.white },
  statPillLabel: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 2,
    fontWeight: '600',
    letterSpacing: 0.4,
  },

  modelWrapper: { position: 'relative', marginTop: 8 },
  modelShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  modelCard: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    padding: 16,
  },
  modelHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  modelTitle: { fontSize: 15, fontWeight: '800', color: Colors.onSurfaceLight },
  modelSub: {
    fontSize: 11,
    color: Colors.onSurfaceVariantLight,
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
    color: Colors.onSurfaceVariantLight,
    lineHeight: 19,
    marginBottom: 14,
  },
  errorBanner: {
    backgroundColor: Colors.urgentBgLight,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: Colors.urgentFg,
    padding: 8,
    marginBottom: 10,
  },
  errorText: { fontSize: 12, color: Colors.urgentFg, fontWeight: '600' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  progressTrack: {
    flex: 1,
    height: 6,
    backgroundColor: Colors.outlineLight,
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: { height: 6, backgroundColor: Colors.primary500, borderRadius: 3 },
  progressLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: Colors.onSurfaceVariantLight,
    width: 32,
  },
  modelActions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  actionBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 2,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 120,
  },
  actionBtnPrimary: { backgroundColor: Colors.primary900, borderColor: Colors.primary900 },
  actionBtnPrimaryText: { fontSize: 13, fontWeight: '700', color: Colors.white },
  actionBtnSecondary: {
    backgroundColor: Colors.surfaceVariantLight,
    borderColor: Colors.outlineLight,
  },
  actionBtnSecondaryText: { fontSize: 13, fontWeight: '700', color: Colors.onSurfaceLight },
  actionBtnDestructive: { backgroundColor: Colors.urgentBgLight, borderColor: Colors.urgentFg },
  actionBtnDestructiveText: { fontSize: 13, fontWeight: '700', color: Colors.urgentFg },
  weightNote: {
    fontSize: 11,
    color: Colors.onSurfaceVariantLight,
    marginTop: 10,
    fontWeight: '500',
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary900,
    letterSpacing: 1.2,
    marginBottom: 6,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  tableWrapper: { position: 'relative' },
  tableShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  table: {
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    justifyContent: 'space-between',
  },
  tableRowBorder: { borderTopWidth: 1, borderTopColor: Colors.outlineLight },
  tableLabel: { fontSize: 13, color: Colors.onSurfaceLight, flex: 1, fontWeight: '500' },
  tableWeight: { fontSize: 12, fontWeight: '700', marginLeft: 8 },
  footnote: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 18,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
