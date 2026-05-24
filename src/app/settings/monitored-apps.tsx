import React, { useCallback } from 'react';
import { View, Text, ScrollView, Switch, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { db } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import NotificationListener from '../../../modules/notification-listener/src';

const repo = new MonitoredAppRepository(db);
const DEPTH = 4;

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
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data: apps = [] } = useQuery({
    queryKey: ['monitored-apps'],
    queryFn: () => repo.getAll(),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ packageName, isActive }: { packageName: string; isActive: boolean }) => {
      await repo.setActive(packageName, isActive);
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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Monitored Apps</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          {activeCount > 0
            ? `${activeCount} app${activeCount !== 1 ? 's' : ''} active — only these are monitored.`
            : 'No apps selected — all notifications are monitored.'}
        </Text>

        <Text style={[styles.sectionLabel, { color: theme.primary }]}>COMMON APPS</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {COMMON_APPS.map((app, i) => {
              const existing = appMap.get(app.packageName);
              const isActive = existing?.isActive ?? false;
              return (
                <View
                  key={app.packageName}
                  style={[
                    styles.row,
                    i < COMMON_APPS.length - 1 && {
                      borderBottomWidth: 1,
                      borderBottomColor: theme.outline,
                    },
                  ]}
                >
                  <View style={styles.rowInfo}>
                    <Text style={[styles.appName, { color: theme.onSurface }]}>
                      {app.displayName}
                    </Text>
                    <Text style={[styles.packageName, { color: theme.onSurfaceVariant }]}>
                      {app.packageName}
                    </Text>
                  </View>
                  <Switch
                    value={isActive}
                    onValueChange={(v) => handleToggle(app.packageName, app.displayName, v)}
                    trackColor={{ true: Colors.primary900, false: theme.outline }}
                    thumbColor={Colors.white}
                  />
                </View>
              );
            })}
          </View>
        </View>

        {apps.some((a) => !COMMON_APPS.find((c) => c.packageName === a.packageName)) && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.primary }]}>CUSTOM APPS</Text>
            <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
              <View style={styles.cardShadow} />
              <View style={[styles.card, { backgroundColor: theme.surface }]}>
                {apps
                  .filter((a) => !COMMON_APPS.find((c) => c.packageName === a.packageName))
                  .map((app, i, arr) => (
                    <View
                      key={app.packageName}
                      style={[
                        styles.row,
                        i < arr.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: theme.outline,
                        },
                      ]}
                    >
                      <View style={styles.rowInfo}>
                        <Text style={[styles.appName, { color: theme.onSurface }]}>
                          {app.displayName}
                        </Text>
                        <Text style={[styles.packageName, { color: theme.onSurfaceVariant }]}>
                          {app.packageName}
                        </Text>
                      </View>
                      <Switch
                        value={app.isActive}
                        onValueChange={(v) =>
                          toggleMutation.mutate({ packageName: app.packageName, isActive: v })
                        }
                        trackColor={{ true: Colors.primary900, false: theme.outline }}
                        thumbColor={Colors.white}
                      />
                    </View>
                  ))}
              </View>
            </View>
          </>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            pressed && styles.addBtnPressed,
            pressed && { backgroundColor: theme.pressHighlight },
          ]}
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
                    if (trimmed)
                      addAppMutation.mutate({ packageName: trimmed, displayName: trimmed });
                  },
                },
              ],
              'plain-text'
            )
          }
          accessibilityRole="button"
        >
          <Text style={[styles.addBtnText, { color: theme.primary }]}>+ Add custom app</Text>
        </Pressable>
      </ScrollView>
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
  content: { padding: 16, paddingBottom: 32 },
  description: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 4,
  },
  cardWrapper: { position: 'relative', marginBottom: 20 },
  cardShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  card: {
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  rowInfo: { flex: 1 },
  appName: { fontSize: 15, fontWeight: '600' },
  packageName: { fontSize: 11, marginTop: 2 },
  addBtn: {
    height: 48,
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnPressed: {},
  addBtnText: { fontSize: 14, fontWeight: '700' },
});
