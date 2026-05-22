import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { desc, eq, gt, and, sql } from 'drizzle-orm';
import { Colors } from '@/ui/theme/colors';
import { db } from '@/data/db/client';
import { llmMetrics, trainingLog } from '@/data/db/schema';
import { isSmallLlmLoaded, isLlmLoaded } from '@/services/llm-service';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchSummary() {
  const cutoff = Date.now() - SEVEN_DAYS;
  const rows = await db
    .select({
      total: sql<number>`count(*)`,
      avgDuration: sql<number>`round(avg(duration_ms))`,
      createCount: sql<number>`sum(case when decision='CREATE' then 1 else 0 end)`,
      confirmCount: sql<number>`sum(case when decision='CONFIRM' then 1 else 0 end)`,
      discardCount: sql<number>`sum(case when decision='DISCARD' then 1 else 0 end)`,
    })
    .from(llmMetrics)
    .where(and(eq(llmMetrics.eventType, 'inference'), gt(llmMetrics.createdAt, cutoff)));
  return rows[0] ?? { total: 0, avgDuration: 0, createCount: 0, confirmCount: 0, discardCount: 0 };
}

async function fetchUserFeedback() {
  const cutoff = Date.now() - SEVEN_DAYS;
  const rows = await db
    .select({
      confirmed: sql<number>`sum(case when action='CONFIRMED' then 1 else 0 end)`,
      rejected: sql<number>`sum(case when action='REJECTED' then 1 else 0 end)`,
    })
    .from(trainingLog)
    .where(gt(trainingLog.createdAt, cutoff));
  return rows[0] ?? { confirmed: 0, rejected: 0 };
}

async function fetchLoadHistory() {
  return db
    .select({
      id: llmMetrics.id,
      modelId: llmMetrics.modelId,
      durationMs: llmMetrics.durationMs,
      createdAt: llmMetrics.createdAt,
    })
    .from(llmMetrics)
    .where(eq(llmMetrics.eventType, 'load'))
    .orderBy(desc(llmMetrics.createdAt))
    .limit(10);
}

async function fetchRecentInferences() {
  return db
    .select({
      id: llmMetrics.id,
      modelId: llmMetrics.modelId,
      durationMs: llmMetrics.durationMs,
      decision: llmMetrics.decision,
      confidence: llmMetrics.confidence,
      inputLength: llmMetrics.inputLength,
      createdAt: llmMetrics.createdAt,
    })
    .from(llmMetrics)
    .where(eq(llmMetrics.eventType, 'inference'))
    .orderBy(desc(llmMetrics.createdAt))
    .limit(30);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return `${Math.round(diff / 1000)}s ago`;
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}h ago`;
  return `${Math.round(diff / 86_400_000)}d ago`;
}

function modelLabel(id: string): string {
  if (id === 'qwen3-0.6b') return '0.6B';
  if (id === 'qwen3-1.7b') return '1.7B';
  return id;
}

function decisionColor(decision: string | null | undefined): string {
  if (decision === 'CREATE') return Colors.success;
  if (decision === 'CONFIRM') return Colors.warning;
  if (decision === 'DISCARD') return Colors.onSurfaceVariantLight;
  return Colors.onSurfaceVariantLight;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AnalyticsScreen(): React.JSX.Element {
  const router = useRouter();

  const { data: summary, isLoading: loadingSummary } = useQuery({
    queryKey: ['analytics-summary'],
    queryFn: fetchSummary,
    refetchInterval: 30_000,
  });

  const { data: feedback } = useQuery({
    queryKey: ['analytics-feedback'],
    queryFn: fetchUserFeedback,
    refetchInterval: 30_000,
  });

  const { data: loadHistory = [] } = useQuery({
    queryKey: ['analytics-loads'],
    queryFn: fetchLoadHistory,
    refetchInterval: 60_000,
  });

  const { data: recentInferences = [] } = useQuery({
    queryKey: ['analytics-inferences'],
    queryFn: fetchRecentInferences,
    refetchInterval: 15_000,
  });

  const precisionPct = useMemo(() => {
    const conf = feedback?.confirmed ?? 0;
    const rej = feedback?.rejected ?? 0;
    const total = conf + rej;
    if (total === 0) return null;
    return Math.round((conf / total) * 100);
  }, [feedback]);

  const total = summary?.total ?? 0;
  const createPct = total > 0 ? Math.round(((summary?.createCount ?? 0) / total) * 100) : 0;
  const confirmPct = total > 0 ? Math.round(((summary?.confirmCount ?? 0) / total) * 100) : 0;
  const discardPct = total > 0 ? Math.round(((summary?.discardCount ?? 0) / total) * 100) : 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
        <Text style={styles.title}>AI Analytics</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── Summary cards ── */}
        <Text style={styles.sectionLabel}>LAST 7 DAYS</Text>
        {loadingSummary ? (
          <ActivityIndicator color={Colors.primary500} style={{ marginVertical: 16 }} />
        ) : (
          <View style={styles.summaryRow}>
            <StatCard label="Inferences" value={String(total)} />
            <StatCard
              label="Avg time"
              value={summary?.avgDuration ? `${String(summary.avgDuration)}ms` : '—'}
            />
            <StatCard label="Auto-create" value={total > 0 ? `${createPct}%` : '—'} />
            <StatCard
              label="Precision"
              value={precisionPct !== null ? `${precisionPct}%` : '—'}
              hint="confirm inbox"
            />
          </View>
        )}

        {/* ── Model status ── */}
        <Text style={[styles.sectionLabel, { marginTop: 20 }]}>MODEL STATUS</Text>
        <View style={styles.card}>
          <ModelStatusRow
            label="Qwen3-0.6B (classifier)"
            loaded={isSmallLlmLoaded()}
            lastLoadMs={
              loadHistory.find((r: { modelId: string }) => r.modelId === 'qwen3-0.6b')
                ?.durationMs ?? null
            }
          />
          <View style={styles.divider} />
          <ModelStatusRow
            label="Qwen3-1.7B (extractor)"
            loaded={isLlmLoaded()}
            lastLoadMs={
              loadHistory.find((r: { modelId: string }) => r.modelId === 'qwen3-1.7b')
                ?.durationMs ?? null
            }
          />
        </View>

        {/* ── Decision breakdown ── */}
        {total > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>DECISION BREAKDOWN</Text>
            <View style={styles.card}>
              <BreakdownBar label="AUTO-CREATE" pct={createPct} color={Colors.success} />
              <BreakdownBar label="CONFIRM" pct={confirmPct} color={Colors.warning} />
              <BreakdownBar label="DISCARD" pct={discardPct} color={Colors.onSurfaceVariantLight} />
              {(feedback?.confirmed ?? 0) + (feedback?.rejected ?? 0) > 0 && (
                <View style={styles.feedbackRow}>
                  <Text style={styles.feedbackText}>
                    Confirm inbox decisions — confirmed: {feedback?.confirmed ?? 0} · rejected:{' '}
                    {feedback?.rejected ?? 0}
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* ── Load history ── */}
        {loadHistory.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>LOAD HISTORY</Text>
            <View style={styles.card}>
              {(
                loadHistory as Array<{
                  id: number;
                  modelId: string;
                  durationMs: number;
                  createdAt: number;
                }>
              ).map((row, i) => (
                <View key={row.id} style={[styles.logRow, i > 0 && styles.logRowBorder]}>
                  <View style={styles.logModelBadge}>
                    <Text style={styles.logModelText}>{modelLabel(row.modelId)}</Text>
                  </View>
                  <Text style={styles.logDuration}>{row.durationMs}ms</Text>
                  <Text style={styles.logTime}>{relativeTime(row.createdAt)}</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Recent inferences ── */}
        {recentInferences.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20 }]}>
              RECENT INFERENCES ({recentInferences.length})
            </Text>
            <View style={styles.card}>
              {(
                recentInferences as Array<{
                  id: number;
                  modelId: string;
                  durationMs: number;
                  decision: string | null;
                  confidence: number | null;
                  inputLength: number | null;
                  createdAt: number;
                }>
              ).map((row, i) => (
                <View key={row.id} style={[styles.inferenceRow, i > 0 && styles.logRowBorder]}>
                  <View style={styles.inferenceLeft}>
                    <View style={styles.logModelBadge}>
                      <Text style={styles.logModelText}>{modelLabel(row.modelId)}</Text>
                    </View>
                    <Text style={styles.logDuration}>{row.durationMs}ms</Text>
                    <View
                      style={[
                        styles.decisionBadge,
                        { backgroundColor: decisionColor(row.decision) + '22' },
                      ]}
                    >
                      <Text style={[styles.decisionText, { color: decisionColor(row.decision) }]}>
                        {row.decision ?? '—'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.inferenceRight}>
                    {row.confidence !== null && row.confidence !== undefined && (
                      <Text style={styles.confidenceText}>{Math.round(row.confidence * 100)}%</Text>
                    )}
                    <Text style={styles.logTime}>{relativeTime(row.createdAt)}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        {total === 0 && !loadingSummary && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>No inferences yet</Text>
            <Text style={styles.emptyDesc}>
              Download and load the Qwen3-0.6B classifier from Settings → AI Models. Once loaded,
              metrics appear here as notifications are classified.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
      {hint && <Text style={styles.statHint}>{hint}</Text>}
    </View>
  );
}

function ModelStatusRow({
  label,
  loaded,
  lastLoadMs,
}: {
  label: string;
  loaded: boolean;
  lastLoadMs: number | null;
}): React.JSX.Element {
  return (
    <View style={styles.modelStatusRow}>
      <View
        style={[
          styles.statusDot,
          { backgroundColor: loaded ? Colors.success : Colors.onSurfaceVariantLight },
        ]}
      />
      <Text style={styles.modelStatusLabel}>{label}</Text>
      <Text style={styles.modelStatusRight}>
        {loaded ? 'Loaded' : 'Not loaded'}
        {lastLoadMs !== null ? ` · last load ${lastLoadMs}ms` : ''}
      </Text>
    </View>
  );
}

function BreakdownBar({
  label,
  pct,
  color,
}: {
  label: string;
  pct: number;
  color: string;
}): React.JSX.Element {
  return (
    <View style={styles.breakdownRow}>
      <Text style={styles.breakdownLabel}>{label}</Text>
      <View style={styles.breakdownTrack}>
        <View style={[styles.breakdownFill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={[styles.breakdownPct, { color }]}>{pct}%</Text>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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
  content: { padding: 16, paddingBottom: 40, gap: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  summaryRow: { flexDirection: 'row', gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    elevation: 1,
  },
  statValue: { fontSize: 20, fontWeight: '700', color: Colors.onSurfaceLight },
  statLabel: {
    fontSize: 10,
    color: Colors.onSurfaceVariantLight,
    fontWeight: '500',
    marginTop: 2,
    textAlign: 'center',
  },
  statHint: { fontSize: 9, color: Colors.onSurfaceVariantLight, marginTop: 1, textAlign: 'center' },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 14,
    elevation: 1,
    gap: 10,
  },
  divider: { height: 1, backgroundColor: Colors.outlineLight },
  modelStatusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  modelStatusLabel: { fontSize: 13, color: Colors.onSurfaceLight, flex: 1 },
  modelStatusRight: { fontSize: 12, color: Colors.onSurfaceVariantLight },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    width: 90,
  },
  breakdownTrack: {
    flex: 1,
    height: 8,
    backgroundColor: Colors.outlineLight,
    borderRadius: 4,
    overflow: 'hidden',
  },
  breakdownFill: { height: '100%', borderRadius: 4 },
  breakdownPct: { fontSize: 12, fontWeight: '600', width: 36, textAlign: 'right' },
  feedbackRow: {
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Colors.outlineLight,
  },
  feedbackText: { fontSize: 12, color: Colors.onSurfaceVariantLight },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logRowBorder: { paddingTop: 8, borderTopWidth: 1, borderTopColor: Colors.outlineLight },
  logModelBadge: {
    backgroundColor: Colors.surfaceVariantLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  logModelText: { fontSize: 11, fontWeight: '600', color: Colors.onSurfaceVariantLight },
  logDuration: { fontSize: 12, color: Colors.onSurfaceLight, flex: 1 },
  logTime: { fontSize: 11, color: Colors.onSurfaceVariantLight },
  inferenceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  inferenceLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  inferenceRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  decisionBadge: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  decisionText: { fontSize: 10, fontWeight: '700' },
  confidenceText: { fontSize: 12, color: Colors.onSurfaceVariantLight },
  emptyState: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
    gap: 8,
    marginTop: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceLight },
  emptyDesc: {
    fontSize: 13,
    color: Colors.onSurfaceVariantLight,
    textAlign: 'center',
    lineHeight: 20,
  },
});
