/**
 * Diagnostics Screen — always visible in Settings.
 * Critical for no-local-debugger workflow.
 * Sprint 0: Scaffold with 5 placeholder tabs.
 * Sprint 2: Wired with real data from diagnostics-logger.ts
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Primary } from '../../ui/theme/colors';
import { Spacing } from '../../ui/theme/spacing';
import { TypeScale } from '../../ui/theme/typography';

const COMMIT_SHA = process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev';
const BUILD_TIME = process.env['EXPO_PUBLIC_BUILD_TIME'] ?? 'local';

export default function DiagnosticsScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.sectionHeader}>System Info</Text>
        <View style={styles.card}>
          <InfoRow label="App Version" value="v0.1.0" />
          <InfoRow label="Commit SHA" value={COMMIT_SHA} />
          <InfoRow label="Build Time" value={BUILD_TIME} />
          <InfoRow label="React Native" value="0.79.x" />
          <InfoRow label="Expo SDK" value="53" />
          <InfoRow label="New Architecture" value="Enabled" />
          <InfoRow label="Hermes" value="V1" />
        </View>

        <Text style={styles.sectionHeader}>Tabs (Sprint 2)</Text>
        <View style={styles.card}>
          {['Notifications', 'Extraction', 'Discarded', 'DB Stats', 'System'].map((tab) => (
            <View key={tab} style={styles.row}>
              <Text style={styles.rowText}>📋 {tab}</Text>
              <Text style={styles.rowMeta}>Sprint 2</Text>
            </View>
          ))}
        </View>

        <Text style={styles.note}>
          Full diagnostics logging (notifications captured, extraction decisions, discarded log) will be wired in Sprint 2 alongside F-01 and F-02.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F6FB' },
  container: { padding: Spacing.md, gap: Spacing.md },
  sectionHeader: {
    ...TypeScale.labelLg,
    color: Primary[700],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6DAE0',
    overflow: 'hidden',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F6F8',
  },
  infoLabel: { ...TypeScale.bodyMd, color: '#4A5159' },
  infoValue: { ...TypeScale.bodyMd, color: Primary[900], fontWeight: '500' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F6F8',
  },
  rowText: { ...TypeScale.bodyMd, color: '#1A1D21' },
  rowMeta: { ...TypeScale.labelMd, color: '#A8B0B9' },
  note: { ...TypeScale.bodyMd, color: '#4A5159', lineHeight: 22 },
});
