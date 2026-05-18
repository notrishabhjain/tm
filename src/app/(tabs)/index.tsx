/**
 * Home Screen — Task List
 * Sprint 0: Shows "Hello TaskMind" placeholder with build info.
 * Sprint 2: Replaced with full FlashList task list.
 */
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Primary, Semantic } from '../../ui/theme/colors';
import { Spacing } from '../../ui/theme/spacing';
import { TypeScale } from '../../ui/theme/typography';

// Build-time constants injected by babel-plugin-transform-inline-environment-variables
const COMMIT_SHA = process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev';
const BUILD_TIME = process.env['EXPO_PUBLIC_BUILD_TIME'] ?? 'local';
const IS_DEV = process.env['NODE_ENV'] !== 'production';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        {/* Top app bar */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>Tasks</Text>
        </View>

        {/* Hello TaskMind card */}
        <View style={styles.heroCard}>
          <Text style={styles.heroTitle}>Hello TaskMind 👋</Text>
          <Text style={styles.heroSubtitle}>
            Sprint 0 · Pipeline & Scaffold Complete
          </Text>
        </View>

        {/* Build info */}
        <View style={styles.infoCard}>
          <Text style={styles.infoHeader}>Build Info</Text>
          <InfoRow label="Version" value="v0.1.0" />
          <InfoRow label="Commit" value={COMMIT_SHA} />
          <InfoRow label="Built" value={BUILD_TIME} />
          <InfoRow label="New Arch" value="Enabled ✓" />
          <InfoRow label="Hermes" value="V1 ✓" />
        </View>

        {/* Next steps */}
        <View style={styles.infoCard}>
          <Text style={styles.infoHeader}>What's Next</Text>
          <Text style={styles.nextItem}>
            ✦ Sprint 1: Custom Notification Listener (F-01)
          </Text>
          <Text style={styles.nextItem}>
            ✦ Sprint 1: Rule-Based Extraction (F-02)
          </Text>
          <Text style={styles.nextItem}>
            ✦ Sprint 1: Task CRUD (F-03)
          </Text>
        </View>
      </ScrollView>

      {/* DEBUG watermark — only in non-production builds */}
      {IS_DEV && (
        <View style={styles.debugBadge} pointerEvents="none">
          <Text style={styles.debugText}>DEBUG</Text>
        </View>
      )}
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
  safeArea: {
    flex: 1,
    backgroundColor: '#F2F6FB',
  },
  container: {
    padding: Spacing.md,
    gap: Spacing.md,
  },
  topBar: {
    height: 56,
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#D6DAE0',
    marginBottom: Spacing.sm,
  },
  topBarTitle: {
    ...TypeScale.titleLg,
    color: Primary[900],
  },
  heroCard: {
    backgroundColor: Primary[900],
    borderRadius: 12,
    padding: Spacing.lg,
    alignItems: 'center',
  },
  heroTitle: {
    ...TypeScale.displayMd,
    color: '#FFFFFF',
    marginBottom: Spacing.sm,
    textAlign: 'center',
  },
  heroSubtitle: {
    ...TypeScale.bodyMd,
    color: Primary[100],
    textAlign: 'center',
  },
  infoCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: Spacing.md,
    borderWidth: 1,
    borderColor: '#D6DAE0',
    gap: Spacing.sm,
  },
  infoHeader: {
    ...TypeScale.labelLg,
    color: Primary[700],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: Spacing.xs,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    ...TypeScale.bodyMd,
    color: '#4A5159',
  },
  infoValue: {
    ...TypeScale.bodyMd,
    color: Primary[900],
    fontWeight: '500',
  },
  nextItem: {
    ...TypeScale.bodyMd,
    color: '#1A1D21',
    lineHeight: 22,
  },
  debugBadge: {
    position: 'absolute',
    bottom: 88, // above tab bar
    right: Spacing.md,
    backgroundColor: Semantic.error,
    borderRadius: 4,
    paddingHorizontal: Spacing.sm,
    paddingVertical: 2,
    opacity: 0.85,
  },
  debugText: {
    ...TypeScale.caption,
    color: '#FFFFFF',
    fontWeight: '600',
    letterSpacing: 0.5,
  },
});
