import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';

const GUIDES: Array<{ manufacturer: string; steps: string[] }> = [
  {
    manufacturer: 'Xiaomi / Redmi / POCO',
    steps: [
      'Settings → Apps → Manage apps → TaskMind',
      'Tap "Battery saver" → No restrictions',
      'Go back → Autostart → Enable TaskMind',
      'Settings → Battery & performance → App battery saver → TaskMind → No restrictions',
    ],
  },
  {
    manufacturer: 'OnePlus',
    steps: [
      "Settings → Battery → Battery Optimization → TaskMind → Don't optimize",
      'Settings → Apps → App management → TaskMind → Battery → Allow background activity',
    ],
  },
  {
    manufacturer: 'Samsung',
    steps: [
      'Settings → Apps → TaskMind → Battery → Unrestricted',
      'Settings → Battery → Background usage limits → Never sleeping apps → Add TaskMind',
    ],
  },
  {
    manufacturer: 'Stock Android / Pixel',
    steps: ['Settings → Apps → TaskMind → Battery → Unrestricted'],
  },
];

export default function BatteryGuideScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
        <Text style={styles.title}>Battery Guide</Text>
        <View style={{ width: 70 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.intro}>
          Some Android manufacturers aggressively kill background services. Follow the steps for
          your device manufacturer to ensure TaskMind keeps running.
        </Text>

        {GUIDES.map((guide) => (
          <View key={guide.manufacturer} style={styles.guideCard}>
            <Text style={styles.manufacturer}>{guide.manufacturer}</Text>
            {guide.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepNum}>{i + 1}.</Text>
                <Text style={styles.stepText}>{step}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.tipCard}>
          <Text style={styles.tipTitle}>After making changes</Text>
          <Text style={styles.tipText}>
            Reboot your device, then check Settings → Diagnostics → System to verify the foreground
            service is running.
          </Text>
        </View>
      </ScrollView>
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
  content: { padding: 16, gap: 16 },
  intro: { fontSize: 14, color: Colors.onSurfaceVariantLight, lineHeight: 22 },
  guideCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    padding: 16,
    elevation: 1,
    gap: 10,
  },
  manufacturer: { fontSize: 15, fontWeight: '700', color: Colors.primary900, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepNum: { fontSize: 13, fontWeight: '700', color: Colors.primary500, minWidth: 16 },
  stepText: { fontSize: 13, color: Colors.onSurfaceLight, flex: 1, lineHeight: 20 },
  tipCard: {
    backgroundColor: Colors.primary100,
    borderRadius: 8,
    padding: 16,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary500,
  },
  tipTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary900, marginBottom: 6 },
  tipText: { fontSize: 13, color: Colors.primary700, lineHeight: 20 },
});
