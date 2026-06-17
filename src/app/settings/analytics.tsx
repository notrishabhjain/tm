import React, { useMemo } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { gt, sql, eq } from 'drizzle-orm';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { db } from '@/data/db/client';
import { trainingLog, discardedLog, tasks, senderStats, learnedKeywords } from '@/data/db/schema';

const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

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
    <Screen>
      <LargeHeader title="Analytics" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* ── 7-day summary ── */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Last 7 days</Text>
        <View style={styles.statsGrid}>
          <StatCard label="Processed" value={String(total)} />
          <StatCard label="Auto-created" value={total > 0 ? `${autoCreatePct}%` : '—'} />
          <StatCard label="Discarded" value={total > 0 ? `${discardPct}%` : '—'} />
          <StatCard
            label="Precision"
            value={precision !== null ? `${precision}%` : '—'}
            hint="confirm inbox"
          />
        </View>

        {/* ── Decision breakdown ── */}
        {total > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.onSurfaceVariant }]}>
              Decision breakdown
            </Text>
            <Card>
              <BreakdownBar label="Auto-create" pct={autoCreatePct} color={Colors.success} />
              <BreakdownBar label="Confirm" pct={confirmPct} color={Colors.highFg} />
              <BreakdownBar label="Discard" pct={discardPct} color={theme.onSurfaceVariant} />
            </Card>
          </>
        )}

        {/* ── User feedback ── */}
        {(feedback?.confirmed ?? 0) + (feedback?.rejected ?? 0) > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.onSurfaceVariant }]}>
              User feedback
            </Text>
            <Card>
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
            </Card>
          </>
        )}

        {/* ── Discard reasons ── */}
        {discardReasons.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.onSurfaceVariant }]}>
              Discard reasons
            </Text>
            <Card>
              {discardReasons.map((r: { reason: string; count: number }, i: number) => (
                <FeedbackRow
                  key={r.reason}
                  label={r.reason.replace(/_/g, ' ')}
                  value={r.count}
                  color={theme.onSurfaceVariant}
                  border={i > 0}
                />
              ))}
            </Card>
          </>
        )}

        {/* ── Sender trust tiers ── */}
        {tiers.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.onSurfaceVariant }]}>
              Sender trust tiers
            </Text>
            <Card>
              {tiers.map((t: { tier: string; count: number }, i: number) => (
                <FeedbackRow
                  key={t.tier}
                  label={TIER_LABELS[t.tier] ?? t.tier}
                  value={t.count}
                  color={Colors.primary500}
                  border={i > 0}
                />
              ))}
            </Card>
          </>
        )}

        {/* ── Vocabulary ── */}
        <Text style={[styles.sectionLabel, { marginTop: 20, color: theme.onSurfaceVariant }]}>
          Learned vocabulary
        </Text>
        <Card>
          <FeedbackRow label="Active n-grams" value={vocabSize} color={Colors.success} />
        </Card>

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
    </Screen>
  );
}

function Card({ children }: { children: React.ReactNode }): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      {children}
    </View>
  );
}

function StatCard({
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
    <View style={[styles.statCard, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <Text style={[styles.statValue, { color: theme.onSurface }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.onSurfaceVariant }]}>{label}</Text>
      {hint && <Text style={[styles.statHint, { color: theme.onSurfaceVariant }]}>{hint}</Text>}
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
        border && {
          borderTopWidth: 0.5,
          borderTopColor: theme.outline,
          paddingTop: 8,
          marginTop: 4,
        },
      ]}
    >
      <Text style={[styles.feedbackLabel, { color: theme.onSurface }]}>{label}</Text>
      <Text style={[styles.feedbackValue, { color }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statCard: {
    width: '47%',
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
  },
  statValue: { fontSize: 24, fontWeight: '700' },
  statLabel: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 4,
    textAlign: 'center',
  },
  statHint: { fontSize: 10, marginTop: 1, textAlign: 'center' },
  card: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    gap: 10,
    marginBottom: 4,
  },
  breakdownRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  breakdownLabel: {
    fontSize: 11,
    fontWeight: '500',
    width: 88,
  },
  breakdownTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  breakdownFill: { height: '100%' },
  breakdownPct: { fontSize: 12, fontWeight: '600', width: 36, textAlign: 'right' },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  feedbackLabel: { fontSize: 13, fontWeight: '500' },
  feedbackValue: { fontSize: 16, fontWeight: '700' },
  emptyState: {
    marginTop: 32,
    padding: 24,
    borderWidth: 0.5,
    borderRadius: 16,
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  emptyDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 20,
  },
});
