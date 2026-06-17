import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { Screen } from '@/ui/components/Screen';
import { db, initializeDatabase } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import NotificationListener from '../../../modules/notification-listener/src';

interface AppEntry {
  packageName: string;
  displayName: string;
  selected: boolean;
}

// Canonical list — kept in sync with settings/monitored-apps.tsx COMMON_APPS
const ALL_APPS: Omit<AppEntry, 'selected'>[] = [
  { packageName: 'com.whatsapp', displayName: 'WhatsApp' },
  { packageName: 'com.google.android.gm', displayName: 'Gmail' },
  { packageName: 'com.Slack', displayName: 'Slack' },
  { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams' },
  { packageName: 'org.telegram.messenger', displayName: 'Telegram' },
  { packageName: 'org.thoughtcrime.securesms', displayName: 'Signal' },
  { packageName: 'com.whatsapp.w4b', displayName: 'WhatsApp Business' },
  { packageName: 'com.google.android.apps.messaging', displayName: 'Messages (SMS)' },
  { packageName: 'com.microsoft.office.outlook', displayName: 'Outlook' },
  { packageName: 'com.discord', displayName: 'Discord' },
];

// Default selection for a fresh install
const DEFAULT_SELECTED = new Set([
  'com.whatsapp',
  'com.google.android.gm',
  'com.Slack',
  'com.microsoft.teams',
  'org.telegram.messenger',
]);

export default function OnboardingAppsScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [apps, setApps] = useState<AppEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load existing DB state so re-running onboarding shows current selections
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        initializeDatabase();
        const repo = new MonitoredAppRepository(db);
        const existing = await repo.getAll();
        const existingMap = new Map(existing.map((a) => [a.packageName, a.isActive]));

        const entries: AppEntry[] = ALL_APPS.map((app) => ({
          ...app,
          selected: existingMap.has(app.packageName)
            ? (existingMap.get(app.packageName) ?? false)
            : DEFAULT_SELECTED.has(app.packageName),
        }));
        if (mounted) {
          setApps(entries);
          setLoading(false);
        }
      } catch {
        // Fallback to defaults
        if (mounted) {
          setApps(ALL_APPS.map((a) => ({ ...a, selected: DEFAULT_SELECTED.has(a.packageName) })));
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const toggleApp = (packageName: string): void => {
    setApps((prev) =>
      prev.map((a) => (a.packageName === packageName ? { ...a, selected: !a.selected } : a))
    );
  };

  const allSelected = apps.every((a) => a.selected);
  const toggleAll = (): void => {
    const next = !allSelected;
    setApps((prev) => prev.map((a) => ({ ...a, selected: next })));
  };

  const handleContinue = async (): Promise<void> => {
    try {
      initializeDatabase();
      const repo = new MonitoredAppRepository(db);
      // Upsert all apps, then set active state to match selections
      await Promise.all(
        apps.map(async (a) => {
          await repo.upsert(a.packageName, a.displayName);
          await repo.setActive(a.packageName, a.selected);
        })
      );
      // Push the selection to the native listener filter too — otherwise it
      // stays unsynced until the user touches a toggle in Settings.
      const activeNames = await repo.getActivePackageNames();
      await NotificationListener.setMonitoredApps(activeNames);
    } catch {
      /* non-fatal — configurable in Settings */
    }
    void router.push('/onboarding/vip');
  };

  const selectedCount = apps.filter((a) => a.selected).length;

  if (loading) {
    return (
      <Screen>
        <View />
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={styles.topSection}>
        <Text style={[styles.stepLabel, { color: theme.primary }]}>Step 2 of 4</Text>
        <Text style={[styles.title, { color: theme.onSurface }]}>Choose Apps to Monitor</Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          TaskMind will process notifications only from selected apps. You can change this anytime
          in Settings → Monitored Apps.
        </Text>
      </View>

      {/* Select-all toggle */}
      <View
        style={[
          styles.selectAllRow,
          { borderColor: theme.outline, backgroundColor: theme.surfaceVariant },
        ]}
      >
        <Text style={[styles.selectAllLabel, { color: theme.onSurface }]}>Monitor all apps</Text>
        <Switch
          value={allSelected}
          onValueChange={toggleAll}
          trackColor={{ true: Colors.primary500, false: theme.outline }}
          thumbColor={Colors.white}
        />
      </View>

      <FlatList
        data={apps}
        keyExtractor={(item) => item.packageName}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.appRow,
              { backgroundColor: theme.surfaceVariant, borderColor: theme.outline },
              item.selected && { borderColor: Colors.primary500 },
              pressed && { opacity: 0.7 },
            ]}
            onPress={() => toggleApp(item.packageName)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.selected }}
          >
            <View
              style={[
                styles.checkbox,
                { borderColor: theme.outline },
                item.selected && styles.checkboxSelected,
              ]}
            >
              {item.selected && <View style={styles.checkmarkFill} />}
            </View>
            <Text
              style={[
                styles.appName,
                { color: theme.onSurface },
                item.selected && styles.appNameSelected,
                item.selected && { color: theme.primary },
              ]}
            >
              {item.displayName}
            </Text>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
      />

      <View style={styles.footer}>
        <Button
          label={
            selectedCount === 0
              ? 'Monitor all apps'
              : `Continue with ${selectedCount} app${selectedCount !== 1 ? 's' : ''}`
          }
          onPress={() => void handleContinue()}
          fullWidth
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topSection: { padding: 24, paddingBottom: 12 },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 12 },
  description: { fontSize: 14, lineHeight: 22 },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 14,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  selectAllLabel: { fontSize: 14, fontWeight: '600' },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 8 },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 14,
    borderWidth: 0.5,
    gap: 12,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 8,
    borderWidth: 0.5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.primary500, borderColor: Colors.primary500 },
  checkmarkFill: { width: 8, height: 8, borderRadius: 2, backgroundColor: Colors.white },
  appName: { fontSize: 15, fontWeight: '500' },
  appNameSelected: { fontWeight: '700' },
  footer: { padding: 24, paddingTop: 12 },
});
