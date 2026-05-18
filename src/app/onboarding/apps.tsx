import React, { useState } from 'react';
import { View, Text, FlatList, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';

const DEFAULT_APPS = [
  { packageName: 'com.whatsapp', displayName: 'WhatsApp', selected: true },
  { packageName: 'com.google.android.gm', displayName: 'Gmail', selected: true },
  { packageName: 'com.Slack', displayName: 'Slack', selected: true },
  { packageName: 'org.thoughtcrime.securesms', displayName: 'Signal', selected: false },
  { packageName: 'com.microsoft.teams', displayName: 'Microsoft Teams', selected: false },
  { packageName: 'org.telegram.messenger', displayName: 'Telegram', selected: false },
];

export default function OnboardingAppsScreen(): React.JSX.Element {
  const router = useRouter();
  const [apps, setApps] = useState(DEFAULT_APPS);

  const toggleApp = (packageName: string): void => {
    setApps((prev) =>
      prev.map((a) => (a.packageName === packageName ? { ...a, selected: !a.selected } : a))
    );
  };

  const handleContinue = async (): Promise<void> => {
    // Store selected apps (in a real impl, this would call MonitoredAppRepository)
    void router.push('/onboarding/vip');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.stepLabel}>Step 2 of 4</Text>
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
          <Pressable
            style={[styles.appRow, item.selected && styles.appRowSelected]}
            onPress={() => toggleApp(item.packageName)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.selected }}
          >
            <View style={[styles.checkbox, item.selected && styles.checkboxSelected]}>
              {item.selected && <Text style={styles.checkmark}>✓</Text>}
            </View>
            <Text style={styles.appName}>{item.displayName}</Text>
          </Pressable>
        )}
        contentContainerStyle={styles.list}
      />

      <View style={styles.footer}>
        <Button
          label={`Continue with ${apps.filter((a) => a.selected).length} apps →`}
          onPress={() => void handleContinue()}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: { padding: 24, paddingBottom: 16 },
  stepLabel: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.primary900, marginBottom: 12 },
  description: { fontSize: 15, color: Colors.onSurfaceVariantLight, lineHeight: 24 },
  list: { paddingHorizontal: 16, paddingBottom: 16 },
  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    marginBottom: 8,
    elevation: 1,
    gap: 12,
  },
  appRowSelected: {
    borderWidth: 1,
    borderColor: Colors.primary500,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: Colors.outlineLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxSelected: {
    backgroundColor: Colors.primary500,
    borderColor: Colors.primary500,
  },
  checkmark: { fontSize: 14, color: Colors.white, fontWeight: '700' },
  appName: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  footer: { padding: 24, paddingTop: 16 },
});
