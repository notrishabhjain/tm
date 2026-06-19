import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';

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
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <LargeHeader title="Battery" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: theme.onSurfaceVariant }]}>
          Some Android manufacturers aggressively kill background services. Follow the steps for
          your device manufacturer to ensure TaskMind keeps running.
        </Text>

        {GUIDES.map((guide) => (
          <View
            key={guide.manufacturer}
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <Text style={[styles.manufacturer, { color: theme.onSurface }]}>
              {guide.manufacturer}
            </Text>
            {guide.steps.map((step, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={[styles.stepNum, { color: theme.onSurfaceVariant }]}>{i + 1}.</Text>
                <Text style={[styles.stepText, { color: theme.onSurface }]}>{step}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={[styles.tipCard, { backgroundColor: Colors.mediumBgLight }]}>
          <Text style={[styles.tipTitle, { color: Colors.mediumFg }]}>After making changes</Text>
          <Text style={[styles.tipText, { color: theme.onSurface }]}>
            Reboot your device, then check Settings → Diagnostics → System to verify the foreground
            service is running.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  intro: { fontSize: 13, lineHeight: 20 },
  card: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  manufacturer: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepNum: { fontSize: 13, fontWeight: '600', minWidth: 16 },
  stepText: { fontSize: 13, flex: 1, lineHeight: 19 },
  tipCard: {
    borderRadius: 16,
    padding: 16,
  },
  tipTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  tipText: { fontSize: 13, lineHeight: 19 },
});
