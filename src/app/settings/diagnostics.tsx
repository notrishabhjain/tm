import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import {
  getNotificationBuffer,
  getExtractionBuffer,
  type CapturedNotification,
  type ExtractionDecisionLog,
} from '@/services/diagnostics-logger';
import { db } from '@/data/db/client';
import { DiscardedLogRepository } from '@/data/repositories/DiscardedLogRepository';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import type { DiscardedLogEntry } from '@/domain/types';

const discardedRepo = new DiscardedLogRepository(db);
const taskRepo = new TaskRepository(db);
const vipRepo = new VipContactRepository(db);
const monitoredRepo = new MonitoredAppRepository(db);

type DiagTab = 'Notifications' | 'Extraction' | 'Discarded' | 'DB' | 'System';

const TABS: DiagTab[] = ['Notifications', 'Extraction', 'Discarded', 'DB', 'System'];

export default function DiagnosticsScreen(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const [activeTab, setActiveTab] = useState<DiagTab>('Notifications');

  const handleExport = async (): Promise<void> => {
    try {
      const notifications = getNotificationBuffer();
      const extractions = getExtractionBuffer();

      const payload = {
        exportedAt: new Date().toISOString(),
        appVersion: '0.1.0',
        commitSha: process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev',
        notifications,
        extractions,
      };

      const path = `${FileSystem.cacheDirectory ?? '/tmp/'}taskmind-diagnostics-${Date.now()}.json`;
      await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, { mimeType: 'application/json' });
      } else {
        Alert.alert('Export saved', `File saved to: ${path}`);
      }
    } catch (err) {
      Alert.alert('Export failed', String(err));
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Diagnostics</Text>
        <Pressable onPress={() => void handleExport()} style={styles.exportBtn}>
          <Text style={styles.exportText}>Export</Text>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={[
          styles.tabBar,
          { backgroundColor: theme.surface, borderBottomColor: theme.outline },
        ]}
        contentContainerStyle={styles.tabBarContent}
      >
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                { color: theme.onSurfaceVariant },
                activeTab === tab && styles.tabTextActive,
              ]}
            >
              {tab}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <ScrollView style={styles.content}>
        {activeTab === 'Notifications' && <NotificationsTab />}
        {activeTab === 'Extraction' && <ExtractionTab />}
        {activeTab === 'Discarded' && <DiscardedTab />}
        {activeTab === 'DB' && <DBTab />}
        {activeTab === 'System' && <SystemTab />}
      </ScrollView>
    </View>
  );
}

function NotificationsTab(): React.JSX.Element {
  const buffer = getNotificationBuffer();
  const theme = useTheme();

  if (buffer.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <Text style={[styles.emptyText, { color: theme.onSurface }]}>
          No notifications captured yet.
        </Text>
        <Text style={[styles.emptyHint, { color: theme.onSurfaceVariant }]}>
          Notifications from monitored apps will appear here after they are processed.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.logList}>
      {buffer.map((item, i) => (
        <NotificationRow
          key={i}
          item={item}
          surfaceColor={theme.surface}
          outlineColor={theme.outline}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
        />
      ))}
    </View>
  );
}

function NotificationRow({
  item,
  surfaceColor,
  outlineColor,
  onSurfaceColor,
  onSurfaceVariantColor,
}: {
  item: CapturedNotification;
  surfaceColor: string;
  outlineColor: string;
  onSurfaceColor: string;
  onSurfaceVariantColor: string;
}): React.JSX.Element {
  const statusColor = item.status === 'PASSED' ? Colors.success : Colors.error;

  return (
    <View style={[styles.logRow, { backgroundColor: surfaceColor, borderColor: outlineColor }]}>
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <View style={styles.logContent}>
        <Text style={[styles.logTitle, { color: onSurfaceColor }]} numberOfLines={1}>
          [{item.appName}] {item.title}
        </Text>
        <Text style={[styles.logBody, { color: onSurfaceVariantColor }]} numberOfLines={2}>
          {item.text}
        </Text>
        <Text style={[styles.logMeta, { color: onSurfaceVariantColor }]}>
          {item.status} · {new Date(item.capturedAt).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
}

function ExtractionTab(): React.JSX.Element {
  const buffer = getExtractionBuffer();
  const theme = useTheme();

  if (buffer.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <Text style={[styles.emptyText, { color: theme.onSurface }]}>
          No extraction decisions yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.logList}>
      {buffer.map((item, i) => (
        <ExtractionRow
          key={i}
          item={item}
          surfaceColor={theme.surface}
          outlineColor={theme.outline}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
        />
      ))}
    </View>
  );
}

function ExtractionRow({
  item,
  surfaceColor,
  outlineColor,
  onSurfaceColor,
  onSurfaceVariantColor,
}: {
  item: ExtractionDecisionLog;
  surfaceColor: string;
  outlineColor: string;
  onSurfaceColor: string;
  onSurfaceVariantColor: string;
}): React.JSX.Element {
  const decisionColor =
    item.decision === 'CREATE'
      ? Colors.success
      : item.decision === 'CONFIRM'
        ? Colors.warning
        : Colors.error;

  return (
    <View style={[styles.logRow, { backgroundColor: surfaceColor, borderColor: outlineColor }]}>
      <View style={[styles.statusDot, { backgroundColor: decisionColor }]} />
      <View style={styles.logContent}>
        <Text style={[styles.logTitle, { color: onSurfaceColor }]} numberOfLines={1}>
          {item.input.slice(0, 60)}
        </Text>
        <Text style={[styles.logMeta, { color: onSurfaceVariantColor }]}>
          {item.decision} · score: {item.finalScore.toFixed(2)} · {item.language}
        </Text>
        {item.matchedKeywords.length > 0 && (
          <Text style={styles.logKeywords}>
            Keywords: {item.matchedKeywords.slice(0, 5).join(', ')}
          </Text>
        )}
      </View>
    </View>
  );
}

function DiscardedTab(): React.JSX.Element {
  const queryClient = useQueryClient();
  const theme = useTheme();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['discarded-log'],
    queryFn: () => discardedRepo.getAll(100),
    refetchInterval: 10000,
  });

  const promoteMutation = useMutation({
    mutationFn: async (entry: DiscardedLogEntry) => {
      await taskRepo.createTask({
        title: entry.bodyPreview.slice(0, 120),
        body: entry.bodyPreview,
        sourceApp: entry.sourceApp,
        sender: entry.sender ?? undefined,
        priority: 'MEDIUM',
        confidence: 0.5,
        ruleScore: 0,
        language: 'EN',
        matchedKeywords: [],
        needsConfirmation: true,
      });
      await discardedRepo.deleteById(Number(entry.id));
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['discarded-log'] });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      Alert.alert('Added to Confirm', 'Notification promoted to confirmation queue.');
    },
    onError: (err) => Alert.alert('Error', String(err)),
  });

  if (isLoading) {
    return (
      <View style={styles.emptyTab}>
        <Text style={[styles.emptyText, { color: theme.onSurface }]}>Loading...</Text>
      </View>
    );
  }

  if (entries.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <Text style={[styles.emptyText, { color: theme.onSurface }]}>
          No discarded notifications yet.
        </Text>
        <Text style={[styles.emptyHint, { color: theme.onSurfaceVariant }]}>
          Notifications that scored below the confidence threshold appear here. You can promote any
          of them to the confirmation queue manually.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.logList}>
      {entries.map((entry) => (
        <DiscardedRow
          key={entry.id}
          entry={entry}
          onPromote={() => promoteMutation.mutate(entry)}
          promoting={promoteMutation.isPending}
          surfaceColor={theme.surface}
          outlineColor={theme.outline}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
        />
      ))}
    </View>
  );
}

function DiscardedRow({
  entry,
  onPromote,
  promoting,
  surfaceColor,
  outlineColor,
  onSurfaceColor,
  onSurfaceVariantColor,
}: {
  entry: DiscardedLogEntry;
  onPromote: () => void;
  promoting: boolean;
  surfaceColor: string;
  outlineColor: string;
  onSurfaceColor: string;
  onSurfaceVariantColor: string;
}): React.JSX.Element {
  const appLabel = entry.sourceApp.split('.').pop() ?? entry.sourceApp;
  return (
    <View
      style={[styles.discardedRow, { backgroundColor: surfaceColor, borderColor: outlineColor }]}
    >
      <View style={styles.logContent}>
        <Text style={[styles.logTitle, { color: onSurfaceColor }]} numberOfLines={1}>
          [{appLabel}]{entry.sender ? ` ${entry.sender}` : ''}
        </Text>
        <Text style={[styles.logBody, { color: onSurfaceVariantColor }]} numberOfLines={2}>
          {entry.bodyPreview}
        </Text>
        <Text style={[styles.logMeta, { color: onSurfaceVariantColor }]}>
          {entry.reason} · score: {entry.confidence.toFixed(2)} ·{' '}
          {new Date(entry.createdAt).toLocaleTimeString()}
        </Text>
      </View>
      <Pressable
        style={[styles.promoteBtn, promoting && styles.promoteBtnDisabled]}
        onPress={onPromote}
        disabled={promoting}
      >
        <Text style={styles.promoteBtnText}>+ Task</Text>
      </Pressable>
    </View>
  );
}

interface DBStats {
  taskCounts: Record<string, number>;
  discardedCount: number;
  vipCount: number;
  monitoredAppsCount: number;
  dbSizeKb: number | null;
}

async function fetchDBStats(): Promise<DBStats> {
  const [taskCounts, discardedCount, vips, monitoredApps] = await Promise.all([
    taskRepo.countByStatus(),
    discardedRepo.count(),
    vipRepo.getAll(),
    monitoredRepo.getAll(),
  ]);

  let dbSizeKb: number | null = null;
  try {
    const dbPath = `${FileSystem.documentDirectory ?? ''}SQLite/taskmind.db`;
    const info = await FileSystem.getInfoAsync(dbPath);
    if (info.exists && 'size' in info) {
      dbSizeKb = Math.round((info.size as number) / 1024);
    }
  } catch {
    // File size optional
  }

  return {
    taskCounts,
    discardedCount,
    vipCount: vips.length,
    monitoredAppsCount: monitoredApps.length,
    dbSizeKb,
  };
}

function DBTab(): React.JSX.Element {
  const theme = useTheme();
  const {
    data: stats,
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ['db-stats'],
    queryFn: fetchDBStats,
    refetchInterval: 15000,
  });

  if (isLoading || !stats) {
    return (
      <View style={styles.emptyTab}>
        <Text style={[styles.emptyText, { color: theme.onSurface }]}>Loading stats...</Text>
      </View>
    );
  }

  const totalTasks = Object.values(stats.taskCounts).reduce((a, b) => a + b, 0);

  return (
    <View style={styles.dbTab}>
      <SystemRow
        label="Total Tasks"
        value={String(totalTasks)}
        highlight
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
      {Object.entries(stats.taskCounts).map(([status, count]) => (
        <SystemRow
          key={status}
          label={`  ${status}`}
          value={String(count)}
          outlineColor={theme.outline}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
        />
      ))}
      <SystemRow
        label="Discarded Log"
        value={String(stats.discardedCount)}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
      <SystemRow
        label="VIP Contacts"
        value={String(stats.vipCount)}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
      <SystemRow
        label="Monitored Apps"
        value={String(stats.monitoredAppsCount)}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
      {stats.dbSizeKb !== null && (
        <SystemRow
          label="DB File Size"
          value={`${stats.dbSizeKb} KB`}
          outlineColor={theme.outline}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
        />
      )}
      <Pressable style={styles.refreshBtn} onPress={() => void refetch()}>
        <Text style={styles.refreshBtnText}>Refresh</Text>
      </Pressable>
    </View>
  );
}

function SystemTab(): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.dbTab}>
      <SystemRow
        label="App Version"
        value="0.1.0"
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
      <SystemRow
        label="Commit"
        value={process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev'}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
      <SystemRow
        label="React Native"
        value="0.76.9"
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
      <SystemRow
        label="Expo SDK"
        value="52"
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      />
    </View>
  );
}

function SystemRow({
  label,
  value,
  highlight,
  outlineColor,
  onSurfaceColor,
  onSurfaceVariantColor,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  outlineColor: string;
  onSurfaceColor: string;
  onSurfaceVariantColor: string;
}): React.JSX.Element {
  return (
    <View style={[styles.systemRow, { borderBottomColor: outlineColor }]}>
      <Text
        style={[
          styles.systemLabel,
          { color: onSurfaceVariantColor },
          highlight && styles.systemLabelHighlight,
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.systemValue,
          { color: onSurfaceColor },
          highlight && styles.systemValueHighlight,
        ]}
      >
        {value}
      </Text>
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
  exportBtn: { padding: 4, minWidth: 56, alignItems: 'flex-end' },
  exportText: { fontSize: 14, color: Colors.white, fontWeight: '700' },
  tabBar: {
    borderBottomWidth: 2,
    maxHeight: 46,
  },
  tabBarContent: { alignItems: 'center' },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderBottomColor: Colors.transparent,
  },
  tabActive: { borderBottomColor: Colors.primary900 },
  tabText: { fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: Colors.primary900, fontWeight: '800' },
  content: { flex: 1 },
  emptyTab: { padding: 32, alignItems: 'center' },
  emptyText: {
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyHint: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 18,
  },
  logList: { padding: 12, gap: 8 },
  logRow: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
    borderRadius: 2,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 2, marginTop: 4 },
  logContent: { flex: 1 },
  logTitle: { fontSize: 12, fontWeight: '700', marginBottom: 2 },
  logBody: { fontSize: 11, marginBottom: 2 },
  logMeta: { fontSize: 11 },
  logKeywords: { fontSize: 11, color: Colors.primary900, marginTop: 2, fontWeight: '600' },
  discardedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    borderRadius: 2,
    borderWidth: 1,
    marginBottom: 8,
  },
  promoteBtn: {
    backgroundColor: Colors.primary900,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  promoteBtnDisabled: { opacity: 0.5 },
  promoteBtnText: { color: Colors.white, fontSize: 12, fontWeight: '700' },
  dbTab: { padding: 16 },
  systemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  systemLabel: { fontSize: 13 },
  systemLabelHighlight: { color: Colors.primary900, fontWeight: '700' },
  systemValue: { fontSize: 13, fontWeight: '500' },
  systemValueHighlight: { color: Colors.primary900, fontWeight: '800' },
  refreshBtn: {
    marginTop: 16,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: Colors.primary900,
  },
  refreshBtnText: { color: Colors.primary900, fontSize: 13, fontWeight: '700' },
});
