import React from 'react';
import { View, Text, ScrollView, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';

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

const DEPTH = 4;

export default function BatteryGuideScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Battery Guide</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.intro, { color: theme.onSurfaceVariant }]}>
          Some Android manufacturers aggressively kill background services. Follow the steps for
          your device manufacturer to ensure TaskMind keeps running.
        </Text>

        {GUIDES.map((guide) => (
          <View
            key={guide.manufacturer}
            style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}
          >
            <View style={styles.cardShadow} />
            <View style={[styles.card, { backgroundColor: theme.surface }]}>
              <Text style={styles.manufacturer}>{guide.manufacturer}</Text>
              {guide.steps.map((step, i) => (
                <View key={i} style={styles.stepRow}>
                  <Text style={[styles.stepNum, { color: theme.onSurfaceVariant }]}>{i + 1}.</Text>
                  <Text style={[styles.stepText, { color: theme.onSurface }]}>{step}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}

        <View style={[styles.tipWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={[styles.cardShadow, { backgroundColor: Colors.neoShadowMedium }]} />
          <View
            style={[
              styles.tipCard,
              { borderColor: Colors.mediumFg, backgroundColor: theme.mediumBg },
            ]}
          >
            <Text style={styles.tipTitle}>After making changes</Text>
            <Text style={[styles.tipText, { color: theme.onSurface }]}>
              Reboot your device, then check Settings → Diagnostics → System to verify the
              foreground service is running.
            </Text>
          </View>
        </View>
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
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  intro: { fontSize: 13, lineHeight: 20 },
  cardWrapper: { position: 'relative' },
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
    padding: 14,
    gap: 8,
  },
  manufacturer: { fontSize: 14, fontWeight: '800', color: Colors.primary900, marginBottom: 4 },
  stepRow: { flexDirection: 'row', gap: 8 },
  stepNum: { fontSize: 12, fontWeight: '700', minWidth: 16 },
  stepText: { fontSize: 12, flex: 1, lineHeight: 18 },
  tipWrapper: { position: 'relative' },
  tipCard: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 14,
  },
  tipTitle: { fontSize: 13, fontWeight: '700', color: Colors.primary900, marginBottom: 6 },
  tipText: { fontSize: 13, lineHeight: 19 },
});
