import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Activity, ChevronRight } from 'lucide-react-native';
import { Primary } from '../../ui/theme/colors';
import { Spacing } from '../../ui/theme/spacing';
import { TypeScale } from '../../ui/theme/typography';

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Settings</Text>

        {/* Diagnostics — always visible, non-negotiable */}
        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Diagnostics</Text>
          <TouchableOpacity
            style={styles.row}
            onPress={() => router.push('/settings/diagnostics')}
            accessibilityLabel="Open Diagnostics"
            accessibilityHint="View notification capture log, extraction decisions, and system info"
          >
            <Activity size={20} color={Primary[500]} />
            <Text style={styles.rowLabel}>Diagnostics</Text>
            <ChevronRight size={16} color="#A8B0B9" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionHeader}>Coming Soon</Text>
          <Text style={styles.placeholder}>
            Settings screens arrive in Sprint 2+.{'\n'}
            VIP contacts, monitored apps, nudges,{'\n'}
            email report, and data management.
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F6FB' },
  container: { padding: Spacing.md, gap: Spacing.md },
  title: { ...TypeScale.headline, color: Primary[900] },
  section: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D6DAE0',
    overflow: 'hidden',
  },
  sectionHeader: {
    ...TypeScale.labelLg,
    color: Primary[700],
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    padding: Spacing.md,
    paddingBottom: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: '#F4F6F8',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.md,
    gap: Spacing.sm,
    minHeight: 48,
  },
  rowLabel: { ...TypeScale.bodyLg, color: '#1A1D21' },
  placeholder: { ...TypeScale.bodyMd, color: '#4A5159', padding: Spacing.md, lineHeight: 22 },
});
