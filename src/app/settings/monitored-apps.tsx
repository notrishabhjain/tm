import React, { useCallback } from 'react';
import { View, Text, ScrollView, Switch, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { db } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import NotificationListener from '../../../modules/notification-listener/src';

const repo = new MonitoredAppRepository(db);

const COMMON_APPS = [
  { packageName: 'com.whatsapp', displayName: 'WhatsApp' },
  { packageName: 'com.google.android.gm', displayName: 'Gmail' },
  { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams' },
  { packageName: 'com.Slack', displayName: 'Slack' },
  { packageName: 'org.telegram.messenger', displayName: 'Telegram' },
  { packageName: 'com.whatsapp.w4b', displayName: 'WhatsApp Business' },
  { packageName: 'com.google.android.apps.messaging', displayName: 'Messages' },
  { packageName: 'com.microsoft.office.outlook', displayName: 'Outlook' },
  { packageName: 'com.discord', displayName: 'Discord' },
  { packageName: 'com.instagram.android', displayName: 'Instagram' },
];

export default function MonitoredAppsScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: apps = [] } = useQuery({
    queryKey: ['monitored-apps'],
    queryFn: () => repo.getAll(),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ packageName, isActive }: { packageName: string; isActive: boolean }) => {
      await repo.setActive(packageName, isActive);
      // Sync active package names to native layer
      const activeNames = await repo.getActivePackageNames();
      await NotificationListener.setMonitoredApps(activeNames);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitored-apps'] }),
  });

  const addAppMutation = useMutation({
    mutationFn: async ({
      packageName,
      displayName,
    }: {
      packageName: string;
      displayName: string;
    }) => {
      await repo.upsert(packageName, displayName);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['monitored-apps'] }),
  });

  const appMap = new Map(apps.map((a) => [a.packageName, a]));

  const handleToggle = useCallback(
    (packageName: string, displayName: string, isActive: boolean) => {
      const existing = appMap.get(packageName);
      if (!existing) {
        // Auto-add then enable
        addAppMutation.mutate(
          { packageName, displayName },
          { onSuccess: () => toggleMutation.mutate({ packageName, isActive: true }) }
        );
      } else {
        toggleMutation.mutate({ packageName, isActive });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [appMap]
  );

  const activeCount = apps.filter((a) => a.isActive).length;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Monitored Apps</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          TaskMind watches notifications from these apps and extracts actionable tasks.
          {activeCount > 0
            ? ` ${activeCount} app${activeCount !== 1 ? 's' : ''} active.`
            : ' No apps active — all notifications monitored.'}
        </Text>

        <Text style={styles.sectionLabel}>COMMON APPS</Text>
        <View style={styles.card}>
          {COMMON_APPS.map((app, i) => {
            const existing = appMap.get(app.packageName);
            const isActive = existing?.isActive ?? false;
            return (
              <View
                key={app.packageName}
                style={[styles.row, i < COMMON_APPS.length - 1 && styles.rowBorder]}
              >
                <View style={styles.rowInfo}>
                  <Text style={styles.appName}>{app.displayName}</Text>
                  <Text style={styles.packageName}>{app.packageName}</Text>
                </View>
                <Switch
                  value={isActive}
                  onValueChange={(v) => handleToggle(app.packageName, app.displayName, v)}
                  trackColor={{ true: Colors.primary500, false: Colors.outlineLight }}
                  thumbColor={Colors.white}
                />
              </View>
            );
          })}
        </View>

        {apps.some((a) => !COMMON_APPS.find((c) => c.packageName === a.packageName)) && (
          <>
            <Text style={styles.sectionLabel}>CUSTOM APPS</Text>
            <View style={styles.card}>
              {apps
                .filter((a) => !COMMON_APPS.find((c) => c.packageName === a.packageName))
                .map((app, i, arr) => (
                  <View
                    key={app.packageName}
                    style={[styles.row, i < arr.length - 1 && styles.rowBorder]}
                  >
                    <View style={styles.rowInfo}>
                      <Text style={styles.appName}>{app.displayName}</Text>
                      <Text style={styles.packageName}>{app.packageName}</Text>
                    </View>
                    <Switch
                      value={app.isActive}
                      onValueChange={(v) =>
                        toggleMutation.mutate({ packageName: app.packageName, isActive: v })
                      }
                      trackColor={{ true: Colors.primary500, false: Colors.outlineLight }}
                      thumbColor={Colors.white}
                    />
                  </View>
                ))}
            </View>
          </>
        )}

        <Pressable
          style={styles.addButton}
          onPress={() =>
            Alert.prompt(
              'Add App',
              'Enter the package name (e.g. com.example.app)',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Add',
                  onPress: (pkg) => {
                    const trimmed = pkg?.trim();
                    if (trimmed) {
                      addAppMutation.mutate({ packageName: trimmed, displayName: trimmed });
                    }
                  },
                },
              ],
              'plain-text'
            )
          }
        >
          <Text style={styles.addButtonText}>+ Add custom app</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
    gap: 12,
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 17, color: Colors.primary500 },
  title: { fontSize: 17, fontWeight: '600', color: Colors.onSurfaceLight },
  content: { padding: 16, paddingBottom: 32 },
  description: {
    fontSize: 14,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 1,
    marginBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.outlineLight },
  rowInfo: { flex: 1 },
  appName: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  packageName: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginTop: 2 },
  addButton: {
    alignItems: 'center',
    padding: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.primary500,
    borderStyle: 'dashed',
  },
  addButtonText: { fontSize: 14, color: Colors.primary500, fontWeight: '600' },
});
