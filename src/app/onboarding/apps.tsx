import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet, Switch } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import { db, initializeDatabase } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';

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

const DEPTH = 4;

export default function OnboardingAppsScreen(): React.JSX.Element {
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
    } catch {
      /* non-fatal — configurable in Settings */
    }
    void router.push('/onboarding/vip');
  };

  const selectedCount = apps.filter((a) => a.selected).length;

  if (loading) {
    return <View style={styles.container} />;
  }

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text style={styles.stepLabel}>STEP 2 OF 4</Text>
        <Text style={styles.title}>Choose Apps to Monitor</Text>
        <Text style={styles.description}>
          TaskMind will process notifications only from selected apps. You can change this anytime
          in Settings → Monitored Apps.
        </Text>
      </View>

      {/* Select-all toggle */}
      <View style={styles.selectAllRow}>
        <Text style={styles.selectAllLabel}>Monitor all apps</Text>
        <Switch
          value={allSelected}
          onValueChange={toggleAll}
          trackColor={{ true: Colors.primary900, false: Colors.outlineLight }}
          thumbColor={Colors.white}
        />
      </View>

      <FlatList
        data={apps}
        keyExtractor={(item) => item.packageName}
        renderItem={({ item }) => (
          <View style={[styles.rowWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
            <View
              style={[
                styles.rowShadow,
                item.selected && { backgroundColor: Colors.neoShadowDefault },
              ]}
            />
            <Pressable
              style={[styles.appRow, item.selected && styles.appRowSelected]}
              onPress={() => toggleApp(item.packageName)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.selected }}
            >
              <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
                {item.selected && <View style={styles.checkmarkFill} />}
              </View>
              <Text style={[styles.appName, item.selected && styles.appNameSelected]}>
                {item.displayName}
              </Text>
            </Pressable>
          </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  topSection: { padding: 24, paddingBottom: 12 },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary900,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.primary900, marginBottom: 12 },
  description: { fontSize: 14, color: Colors.onSurfaceVariantLight, lineHeight: 22 },
  selectAllRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: Colors.outlineLight,
    backgroundColor: Colors.surfaceVariantLight,
    marginBottom: 4,
  },
  selectAllLabel: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceLight },
  list: { paddingHorizontal: 16, paddingBottom: 16, gap: 4 },
  rowWrapper: { position: 'relative' },
  rowShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.outlineLight,
    borderRadius: 2,
  },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: Colors.outlineLight,
    gap: 12,
  },
  appRowSelected: { borderColor: Colors.primary900 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: Colors.outlineLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: { backgroundColor: Colors.primary900, borderColor: Colors.primary900 },
  checkmarkFill: { width: 8, height: 8, borderRadius: 1, backgroundColor: Colors.white },
  appName: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  appNameSelected: { color: Colors.primary900, fontWeight: '700' },
  footer: { padding: 24, paddingTop: 12 },
});
