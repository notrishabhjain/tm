import React from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';

export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Section title="Monitoring">
        <NavRow label="Monitored Apps" subtitle="6 apps active" onPress={() => {}} />
        <NavRow label="VIP Contacts" subtitle="None set" onPress={() => {}} />
      </Section>

      <Section title="Intelligence">
        <NavRow label="Priority Rules" subtitle="Rule-based mode" onPress={() => {}} />
        <NavRow
          label="Learned Vocabulary"
          onPress={() => void router.push('/settings/vocabulary')}
        />
      </Section>

      <Section title="Nudges">
        <NavRow label="Nudge Schedule" subtitle="Every 60 min" onPress={() => {}} />
        <NavRow label="Quiet Hours" subtitle="22:00 – 07:00" onPress={() => {}} />
        <ToggleRow label="Urgent overrides quiet hours" value={true} onChange={() => {}} />
      </Section>

      <Section title="Reports">
        <NavRow
          label="Daily Email Report"
          subtitle="Not configured"
          onPress={() => void router.push('/settings/email-report')}
        />
      </Section>

      <Section title="Data">
        <NavRow label="Export / Import" onPress={() => {}} />
        <NavRow label="Auto Backup" subtitle="Enabled" onPress={() => {}} />
      </Section>

      <Section title="Device">
        <NavRow
          label="Battery Optimization Guide"
          onPress={() => void router.push('/settings/battery-guide')}
        />
        <NavRow label="Appearance" subtitle="System default" onPress={() => {}} />
      </Section>

      <Section title="Debug">
        <NavRow
          label="Diagnostics"
          subtitle="Notification capture, extraction log"
          onPress={() => void router.push('/settings/diagnostics')}
        />
      </Section>

      <View style={styles.versionRow}>
        <Text style={styles.versionText}>
          TaskMind v0.1.0 · {process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev'}
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  );
}

function NavRow({
  label,
  subtitle,
  onPress,
}: {
  label: string;
  subtitle?: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.rowLeft}>
        <Text style={styles.rowLabel}>{label}</Text>
        {subtitle && <Text style={styles.rowSubtitle}>{subtitle}</Text>}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, styles.flex1]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.primary500, false: Colors.outlineLight }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
  },
  content: {
    paddingBottom: 32,
  },
  section: {
    marginTop: 24,
    marginHorizontal: 16,
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  rowPressed: {
    backgroundColor: Colors.surfaceVariantLight,
  },
  rowLeft: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15,
    color: Colors.onSurfaceLight,
    fontWeight: '400',
  },
  rowSubtitle: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    marginTop: 2,
  },
  chevron: {
    fontSize: 20,
    color: Colors.onSurfaceVariantLight,
    fontWeight: '300',
  },
  flex1: {
    flex: 1,
  },
  versionRow: {
    alignItems: 'center',
    marginTop: 32,
    marginBottom: 8,
  },
  versionText: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
  },
});
