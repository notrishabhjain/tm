import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import { db, initializeDatabase } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';

const DEFAULT_APPS = [
  { packageName: 'com.whatsapp', displayName: 'WhatsApp', selected: true },
  { packageName: 'com.google.android.gm', displayName: 'Gmail', selected: true },
  { packageName: 'com.Slack', displayName: 'Slack', selected: true },
  { packageName: 'org.thoughtcrime.securesms', displayName: 'Signal', selected: false },
  { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams', selected: false },
  { packageName: 'org.telegram.messenger', displayName: 'Telegram', selected: false },
];

const DEPTH = 4;

export default function OnboardingAppsScreen(): React.JSX.Element {
  const router = useRouter();
  const [apps, setApps] = useState(DEFAULT_APPS);

  const toggleApp = (packageName: string): void => {
    setApps((prev) =>
      prev.map((a) => (a.packageName === packageName ? { ...a, selected: !a.selected } : a))
    );
  };

  const handleContinue = async (): Promise<void> => {
    const selected = apps.filter((a) => a.selected);
    if (selected.length > 0) {
      try {
        initializeDatabase();
        const repo = new MonitoredAppRepository(db);
        await Promise.all(selected.map((a) => repo.upsert(a.packageName, a.displayName)));
      } catch {
        // Non-fatal — user can configure in Settings
      }
    }
    void router.push('/onboarding/vip');
  };

  const selectedCount = apps.filter((a) => a.selected).length;

  return (
    <View style={styles.container}>
      <View style={styles.topSection}>
        <Text style={styles.stepLabel}>STEP 2 OF 4</Text>
        <Text style={styles.title}>Choose Apps to Monitor</Text>
        <Text style={styles.description}>
          TaskMind will only process notifications from these apps. You can change this anytime in
          Settings.
        </Text>
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
          label={`Continue with ${selectedCount} app${selectedCount !== 1 ? 's' : ''}`}
          onPress={() => void handleContinue()}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  topSection: { padding: 24, paddingBottom: 16 },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary900,
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', color: Colors.primary900, marginBottom: 12 },
  description: { fontSize: 14, color: Colors.onSurfaceVariantLight, lineHeight: 22 },
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
  appRowSelected: {
    borderColor: Colors.primary900,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: Colors.outlineLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary900,
    borderColor: Colors.primary900,
  },
  checkmarkFill: { width: 8, height: 8, borderRadius: 1, backgroundColor: Colors.white },
  appName: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  appNameSelected: { color: Colors.primary900, fontWeight: '700' },
  footer: { padding: 24, paddingTop: 16 },
});
