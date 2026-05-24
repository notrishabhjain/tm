import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { gt, sql, eq } from 'drizzle-orm';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { db } from '@/data/db/client';
import { trainingLog, discardedLog, tasks, senderStats, learnedKeywords } from '@/data/db/schema';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
const DEPTH = 4;

async function fetchDecisionStats() {
  const cutoff = Date.now() - SEVEN_DAYS;
  const [taskRow] = await db
    .select({
      created: sql<number>`count(*)`,
      needsConfirm: sql<number>`sum(case when needs_confirmation=1 then 1 else 0 end)`,
    })
    .from(tasks)
    .where(gt(tasks.createdAt, cutoff));
  const [discardRow] = await db
    .select({ discarded: sql<number>`count(*)` })
    .from(discardedLog)
    .where(gt(discardedLog.createdAt, cutoff));
  return {
    created: taskRow?.created ?? 0,
    needsConfirm: taskRow?.needsConfirm ?? 0,
    discarded: discardRow?.discarded ?? 0,
  };
}

async function fetchUserFeedback() {
  const cutoff = Date.now() - SEVEN_DAYS;
  const [row] = await db
    .select({
      confirmed: sql<number>`sum(case when action='CONFIRMED' then 1 else 0 end)`,
      rejected: sql<number>`sum(case when action='REJECTED' then 1 else 0 end)`,
      completed: sql<number>`sum(case when action='COMPLETED' then 1 else 0 end)`,
    })
    .from(trainingLog)
    .where(gt(trainingLog.createdAt, cutoff));
  return {
    confirmed: row?.confirmed ?? 0,
    rejected: row?.rejected ?? 0,
    completed: row?.completed ?? 0,
  };
}

async function fetchTierBreakdown() {
  return db
    .select({
      tier: senderStats.tier,
      count: sql<number>`count(*)`,
    })
    .from(senderStats)
    .groupBy(senderStats.tier);
}

async function fetchVocabSize() {
  const [row] = await db
    .select({ active: sql<number>`count(*)` })
    .from(learnedKeywords)
    .where(eq(learnedKeywords.status, 'ACTIVE'));
  return row?.active ?? 0;
}

async function fetchDiscardReasons() {
  const cutoff = Date.now() - SEVEN_DAYS;
  return db
    .select({
      reason: discardedLog.reason,
      count: sql<number>`count(*)`,
    })
    .from(discardedLog)
    .where(gt(discardedLog.createdAt, cutoff))
    .groupBy(discardedLog.reason);
}

const TIER_LABELS: Record<string, string> = {
  VIP_WORK: 'VIP Work',
  VIP_PERSONAL: 'VIP Personal',
  WORK: 'Work',
  INFO: 'Info',
  UNKNOWN: 'Unknown',
};

export default function AnalyticsScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  const { data: decisions } = useQuery({
    queryKey: ['analytics-decisions'],
    queryFn: fetchDecisionStats,
    refetchInterval: 30_000,
  });

  const { data: feedback } = useQuery({
    queryKey: ['analytics-feedback'],
    queryFn: fetchUserFeedback,
    refetchInterval: 30_000,
  });

  const { data: tiers = [] } = useQuery({
    queryKey: ['analytics-tiers'],
    queryFn: fetchTierBreakdown,
    refetchInterval: 60_000,
  });

  const { data: vocabSize = 0 } = useQuery({
    queryKey: ['analytics-vocab'],
    queryFn: fetchVocabSize,
    refetchInterval: 60_000,
  });

  const { data: discardReasons = [] } = useQuery({
    queryKey: ['analytics-discard-reasons'],
    queryFn: fetchDiscardReasons,
    refetchInterval: 60_000,
  });

  const total = (decisions?.created ?? 0) + (decisions?.discarded ?? 0);
  const autoCreated = (decisions?.created ?? 0) - (decisions?.needsConfirm ?? 0);
  const autoCreatePct = total > 0 ? Math.round((autoCreated / total) * 100) : 0;
  const confirmPct = total > 0 ? Math.round(((decisions?.needsConfirm ?? 0) / total) * 100) : 0;
  const discardPct = total > 0 ? Math.round(((decisions?.discarded ?? 0) / total) * 100) : 0;

  const precision = useMemo(() => {
    const conf = feedback?.confirmed ?? 0;
    const rej = feedback?.rejected ?? 0;
    const tot = conf + rej;
    return tot === 0 ? null : Math.round((conf / tot) * 100);
  }, [feedback]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Analytics</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── 7-day summary ── */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>LAST 7 DAYS</Text>
        <View style={styles.statsGrid}>
          <NeoStatCard label="PROCESSED" value={String(total)} />
          <NeoStatCard label="AUTO-CREATED" value={total > 0 ? `${autoCreatePct}%` : '—'} />
          <NeoStatCard label="DISCARDED" value={total > 0 ? `${discardPct}%` : '—'} />
          <NeoStatCard
            label="PRECISION"
            value={precision !== null ? `${precision}%` : '—'}
            hint="confirm inbox"
          />
        </View>

        {/* ── Decision breakdown ── */}
        {total > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.primary }]}>
              DECISION BREAKDOWN
            </Text>
            <NeoCard>
              <BreakdownBar label="AUTO-CREATE" pct={autoCreatePct} color={Colors.success} />
              <BreakdownBar label="CONFIRM" pct={confirmPct} color={Colors.highFg} />
              <BreakdownBar label="DISCARD" pct={discardPct} color={theme.onSurfaceVariant} />
            </NeoCard>
          </>
        )}

        {/* ── User feedback ── */}
        {(feedback?.confirmed ?? 0) + (feedback?.rejected ?? 0) > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.primary }]}>
              USER FEEDBACK
            </Text>
            <NeoCard>
              <FeedbackRow
                label="Confirmed"
                value={feedback?.confirmed ?? 0}
                color={Colors.success}
              />
              <FeedbackRow
                label="Rejected"
                value={feedback?.rejected ?? 0}
                color={Colors.urgentFg}
              />
              <FeedbackRow
                label="Completed"
                value={feedback?.completed ?? 0}
                color={Colors.primary500}
              />
            </NeoCard>
          </>
        )}

        {/* ── Discard reasons ── */}
        {discardReasons.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.primary }]}>
              DISCARD REASONS
            </Text>
            <NeoCard>
              {discardReasons.map((r: { reason: string; count: number }, i: number) => (
                <FeedbackRow
                  key={r.reason}
                  label={r.reason.replace(/_/g, ' ')}
                  value={r.count}
                  color={theme.onSurfaceVariant}
                  border={i > 0}
                />
              ))}
            </NeoCard>
          </>
        )}

        {/* ── Sender trust tiers ── */}
        {tiers.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.primary }]}>
              SENDER TRUST TIERS
            </Text>
            <NeoCard>
              {tiers.map((t: { tier: string; count: number }, i: number) => (
                <FeedbackRow
                  key={t.tier}
                  label={TIER_LABELS[t.tier] ?? t.tier}
                  value={t.count}
                  color={Colors.primary500}
                  border={i > 0}
                />
              ))}
            </NeoCard>
          </>
        )}

        {/* ── Vocabulary ── */}
        <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.primary }]}>
          LEARNED VOCABULARY
        </Text>
        <NeoCard>
          <FeedbackRow label="Active n-grams" value={vocabSize} color={Colors.success} />
        </NeoCard>

        {/* Empty state */}
        {total === 0 && (
          <View
            style={[
              styles.emptyState,
              { backgroundColor: theme.surface, borderColor: theme.outline },
            ]}
          >
            <Text style={[styles.emptyTitle, { color: theme.onSurface }]}>No data yet</Text>
            <Text style={[styles.emptyDesc, { color: theme.onSurfaceVariant }]}>
              Decision metrics will appear here once the notification listener captures and
              processes notifications.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function NeoCard({ children }: { children: React.ReactNode }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={[styles.neoCardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
      <View style={styles.neoCardShadow} />
      <View style={[styles.neoCard, { backgroundColor: theme.surface }]}>{children}</View>
    </View>
  );
}

function NeoStatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={[styles.statWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
      <View style={styles.statShadow} />
      <View style={[styles.statCard, { backgroundColor: theme.surface }]}>
        <Text style={[styles.statValue, { color: theme.onSurface }]}>{value}</Text>
        <Text style={[styles.statLabel, { color: theme.onSurfaceVariant }]}>{label}</Text>
        {hint && <Text style={[styles.statHint, { color: theme.onSurfaceVariant }]}>{hint}</Text>}
      </View>
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
  const theme = useTheme();
  return (
    <View style={styles.breakdownRow}>
      <Text style={[styles.breakdownLabel, { color: theme.onSurfaceVariant }]}>{label}</Text>
      <View style={[styles.breakdownTrack, { backgroundColor: theme.outline }]}>
        <View
          style={[styles.breakdownFill, { width: `${Math.max(pct, 0)}%`, backgroundColor: color }]}
        />
      </View>
      <Text style={[styles.breakdownPct, { color }]}>{pct}%</Text>
    </View>
  );
}

function FeedbackRow({
  label,
  value,
  color,
  border = false,
}: {
  label: string;
  value: number;
  color: string;
  border?: boolean;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.feedbackRow,
        border && { borderTopWidth: 1, borderTopColor: theme.outline, paddingTop: 8, marginTop: 4 },
      ]}
    >
      <Text style={[styles.feedbackLabel, { color: theme.onSurface }]}>{label}</Text>
      <Text style={[styles.feedbackValue, { color }]}>{value}</Text>
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
  title: { fontSize: 17, fontWeight: '800', color: Colors.white, letterSpacing: 0.3 },
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statWrapper: { width: '47%', position: 'relative' },
  statShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  statCard: {
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    padding: 12,
    alignItems: 'center',
  },
  statValue: { fontSize: 22, fontWeight: '800' },
  statLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
    letterSpacing: 0.6,
  },
  statHint: { fontSize: 9, marginTop: 1, textAlign: 'center' },
  neoCardWrapper: { position: 'relative', marginBottom: 4 },
  neoCardShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  neoCard: {
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    padding: 14,
    gap: 10,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel: {
    fontSize: 10,
    fontWeight: '700',
    width: 88,
    letterSpacing: 0.4,
  },
  breakdownTrack: {
    flex: 1,
    height: 6,
    borderRadius: 1,
    overflow: 'hidden',
  },
  breakdownFill: { height: '100%' },
  breakdownPct: { fontSize: 12, fontWeight: '700', width: 36, textAlign: 'right' },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  feedbackLabel: { fontSize: 13, fontWeight: '500' },
  feedbackValue: { fontSize: 16, fontWeight: '800' },
  emptyState: {
    marginTop: 32,
    padding: 24,
    borderWidth: 2,
    borderRadius: 2,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', marginBottom: 8 },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
