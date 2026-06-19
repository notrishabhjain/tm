import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Switch,
  Pressable,
  StyleSheet,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
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
  const theme = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  // Alert.prompt is iOS-only, so the custom-app input uses a Modal on Android.
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [newPackageName, setNewPackageName] = useState('');

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
      const activeNames = await repo.getActivePackageNames();
      await NotificationListener.setMonitoredApps(activeNames);
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
    <Screen>
      <LargeHeader title="Monitored Apps" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          {activeCount > 0
            ? `${activeCount} app${activeCount !== 1 ? 's' : ''} active — only these are monitored.`
            : 'No apps selected — all notifications are monitored.'}
        </Text>

        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Common apps</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          {COMMON_APPS.map((app, i) => {
            const existing = appMap.get(app.packageName);
            const isActive = existing?.isActive ?? false;
            return (
              <View
                key={app.packageName}
                style={[
                  styles.row,
                  i < COMMON_APPS.length - 1 && {
                    borderBottomWidth: 0.5,
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
                  trackColor={{ true: Colors.primary500, false: theme.outline }}
                  thumbColor={Colors.white}
                />
              </View>
            );
          })}
        </View>

        {apps.some((a) => !COMMON_APPS.find((c) => c.packageName === a.packageName)) && (
          <>
            <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
              Custom apps
            </Text>
            <View
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
            >
              {apps
                .filter((a) => !COMMON_APPS.find((c) => c.packageName === a.packageName))
                .map((app, i, arr) => (
                  <View
                    key={app.packageName}
                    style={[
                      styles.row,
                      i < arr.length - 1 && {
                        borderBottomWidth: 0.5,
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
                      trackColor={{ true: Colors.primary500, false: theme.outline }}
                      thumbColor={Colors.white}
                    />
                  </View>
                ))}
            </View>
          </>
        )}

        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            { borderColor: theme.outline },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => {
            setNewPackageName('');
            setAddModalVisible(true);
          }}
          accessibilityRole="button"
        >
          <Text style={[styles.addBtnText, { color: theme.primary }]}>+ Add custom app</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.surface }]}>
            <Text style={[styles.modalTitle, { color: theme.onSurface }]}>Add App</Text>
            <Text style={[styles.modalHint, { color: theme.onSurfaceVariant }]}>
              Enter the package name (e.g. com.example.app)
            </Text>
            <TextInput
              style={[
                styles.modalInput,
                { color: theme.onSurface, backgroundColor: theme.surfaceVariant },
              ]}
              value={newPackageName}
              onChangeText={setNewPackageName}
              placeholder="com.example.app"
              placeholderTextColor={theme.onSurfaceVariant}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
            />
            <View style={styles.modalButtons}>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.7 }]}
                onPress={() => setAddModalVisible(false)}
                accessibilityRole="button"
              >
                <Text style={[styles.modalBtnText, { color: theme.onSurfaceVariant }]}>Cancel</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.modalBtn, pressed && { opacity: 0.7 }]}
                onPress={() => {
                  const trimmed = newPackageName.trim();
                  if (trimmed) {
                    addAppMutation.mutate({ packageName: trimmed, displayName: trimmed });
                  }
                  setAddModalVisible(false);
                }}
                accessibilityRole="button"
              >
                <Text style={[styles.modalBtnText, { color: theme.primary }]}>Add</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  description: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 4,
  },
  card: {
    borderRadius: 16,
    borderWidth: 0.5,
    overflow: 'hidden',
    marginBottom: 20,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12 },
  rowInfo: { flex: 1 },
  appName: { fontSize: 15, fontWeight: '600' },
  packageName: { fontSize: 11, marginTop: 2 },
  addBtn: {
    height: 48,
    borderWidth: 0.5,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { fontSize: 14, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: {
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', marginBottom: 4 },
  modalHint: { fontSize: 13, marginBottom: 12 },
  modalInput: {
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 16,
  },
  modalBtn: { paddingHorizontal: 16, paddingVertical: 10 },
  modalBtnText: { fontSize: 14, fontWeight: '600' },
});
