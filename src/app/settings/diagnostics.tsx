import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Colors } from '@/ui/theme/colors';
import {
  getNotificationBuffer,
  getExtractionBuffer,
  type CapturedNotification,
  type ExtractionDecisionLog,
} from '@/services/diagnostics-logger';

type DiagTab = 'Notifications' | 'Extraction' | 'Discarded' | 'DB' | 'System';

const TABS: DiagTab[] = ['Notifications', 'Extraction', 'Discarded', 'DB', 'System'];

export default function DiagnosticsScreen(): React.JSX.Element {
  const router = useRouter();
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
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
        <Text style={styles.title}>Diagnostics</Text>
        <Pressable onPress={() => void handleExport()} style={styles.exportButton}>
          <Text style={styles.exportText}>Export</Text>
        </Pressable>
      </View>

      {/* Tab bar */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar}>
        {TABS.map((tab) => (
          <Pressable
            key={tab}
            style={[styles.tab, activeTab === tab && styles.tabActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* Tab content */}
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

  if (buffer.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <Text style={styles.emptyText}>No notifications captured yet.</Text>
        <Text style={styles.emptyHint}>
          Notifications from monitored apps will appear here after they're processed.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.logList}>
      {buffer.map((item, i) => (
        <NotificationRow key={i} item={item} />
      ))}
    </View>
  );
}

function NotificationRow({ item }: { item: CapturedNotification }): React.JSX.Element {
  const statusColor = item.status === 'PASSED' ? Colors.success : Colors.error;

  return (
    <View style={styles.logRow}>
      <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
      <View style={styles.logContent}>
        <Text style={styles.logTitle} numberOfLines={1}>
          [{item.appName}] {item.title}
        </Text>
        <Text style={styles.logBody} numberOfLines={2}>
          {item.text}
        </Text>
        <Text style={styles.logMeta}>
          {item.status} · {new Date(item.capturedAt).toLocaleTimeString()}
        </Text>
      </View>
    </View>
  );
}

function ExtractionTab(): React.JSX.Element {
  const buffer = getExtractionBuffer();

  if (buffer.length === 0) {
    return (
      <View style={styles.emptyTab}>
        <Text style={styles.emptyText}>No extraction decisions yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.logList}>
      {buffer.map((item, i) => (
        <ExtractionRow key={i} item={item} />
      ))}
    </View>
  );
}

function ExtractionRow({ item }: { item: ExtractionDecisionLog }): React.JSX.Element {
  const decisionColor =
    item.decision === 'CREATE'
      ? Colors.success
      : item.decision === 'CONFIRM'
        ? Colors.warning
        : Colors.error;

  return (
    <View style={styles.logRow}>
      <View style={[styles.statusDot, { backgroundColor: decisionColor }]} />
      <View style={styles.logContent}>
        <Text style={styles.logTitle} numberOfLines={1}>
          {item.input.slice(0, 60)}
        </Text>
        <Text style={styles.logMeta}>
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
  return (
    <View style={styles.emptyTab}>
      <Text style={styles.emptyText}>Discarded log shown here.</Text>
      <Text style={styles.emptyHint}>
        Tasks that were discarded due to low confidence appear here. You can promote them to tasks
        manually.
      </Text>
    </View>
  );
}

function DBTab(): React.JSX.Element {
  return (
    <View style={styles.dbTab}>
      <Text style={styles.dbTitle}>Database Stats</Text>
      <Text style={styles.dbHint}>Live row counts and DB file size will appear here.</Text>
    </View>
  );
}

function SystemTab(): React.JSX.Element {
  return (
    <View style={styles.dbTab}>
      <SystemRow label="App Version" value="0.1.0" />
      <SystemRow label="Commit" value={process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev'} />
      <SystemRow label="React Native" value="0.76.9" />
      <SystemRow label="Expo SDK" value="52" />
    </View>
  );
}

function SystemRow({ label, value }: { label: string; value: string }): React.JSX.Element {
  return (
    <View style={styles.systemRow}>
      <Text style={styles.systemLabel}>{label}</Text>
      <Text style={styles.systemValue}>{value}</Text>
    </View>
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
  exportButton: { padding: 4 },
  exportText: { fontSize: 14, color: Colors.primary500, fontWeight: '600' },
  tabBar: {
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
    maxHeight: 44,
  },
  tab: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: Colors.transparent,
  },
  tabActive: { borderBottomColor: Colors.primary500 },
  tabText: { fontSize: 13, fontWeight: '500', color: Colors.onSurfaceVariantLight },
  tabTextActive: { color: Colors.primary500, fontWeight: '600' },
  content: { flex: 1 },
  emptyTab: { padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceLight, marginBottom: 8 },
  emptyHint: {
    fontSize: 13,
    color: Colors.onSurfaceVariantLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  logList: { padding: 12, gap: 8 },
  logRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: Colors.surfaceLight,
    padding: 12,
    borderRadius: 8,
    elevation: 1,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4 },
  logContent: { flex: 1 },
  logTitle: { fontSize: 13, fontWeight: '600', color: Colors.onSurfaceLight, marginBottom: 2 },
  logBody: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginBottom: 2 },
  logMeta: { fontSize: 11, color: Colors.onSurfaceVariantLight, fontStyle: 'italic' },
  logKeywords: { fontSize: 11, color: Colors.primary500, marginTop: 2 },
  dbTab: { padding: 16 },
  dbTitle: { fontSize: 15, fontWeight: '600', color: Colors.onSurfaceLight, marginBottom: 8 },
  dbHint: { fontSize: 13, color: Colors.onSurfaceVariantLight },
  systemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  systemLabel: { fontSize: 14, color: Colors.onSurfaceVariantLight },
  systemValue: { fontSize: 14, color: Colors.onSurfaceLight, fontWeight: '500' },
});
