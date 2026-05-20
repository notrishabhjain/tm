import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { getSetting, setSetting } from '@/data/storage/settings';
import { db } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import NotificationListener from '../../../modules/notification-listener/src';

const monitoredRepo = new MonitoredAppRepository(db);
const vipRepo = new VipContactRepository(db);

export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'unknown'>(
    'unknown'
  );
  const [urgentOverride, setUrgentOverride] = useState(getSetting('urgent_override_quiet'));
  const nudgeFreq = getSetting('nudge_freq_minutes');

  const { data: monitoredApps = [] } = useQuery({
    queryKey: ['monitored-apps'],
    queryFn: () => monitoredRepo.getAll(),
  });

  const { data: vipContacts = [] } = useQuery({
    queryKey: ['vip-contacts'],
    queryFn: () => vipRepo.getAll(),
  });

  const checkPermission = useCallback(async () => {
    try {
      const status = await NotificationListener.getPermissionStatus();
      setPermissionStatus(status);
    } catch {
      setPermissionStatus('unknown');
    }
  }, []);

  useEffect(() => {
    void checkPermission();
  }, [checkPermission]);

  // Re-check permission when screen comes back into focus (user may have granted it)
  useFocusEffect(
    useCallback(() => {
      void checkPermission();
    }, [checkPermission])
  );

  const handleGrantPermission = (): void => {
    void NotificationListener.openPermissionSettings();
  };

  const handleUrgentOverride = (value: boolean): void => {
    setUrgentOverride(value);
    setSetting('urgent_override_quiet', value);
  };

  const activeAppCount = monitoredApps.filter((a) => a.isActive).length;
  const nudgeLabel =
    nudgeFreq === 0
      ? 'Off'
      : nudgeFreq < 60
        ? `Every ${nudgeFreq} min`
        : nudgeFreq === 60
          ? 'Every hour'
          : `Every ${nudgeFreq / 60} hours`;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Notification Permission banner */}
      {permissionStatus === 'denied' && (
        <Pressable style={styles.permissionBanner} onPress={handleGrantPermission}>
          <View style={styles.permissionBannerText}>
            <Text style={styles.permissionTitle}>Notification Access Required</Text>
            <Text style={styles.permissionSubtitle}>
              Tap to open settings and grant Notification Listener access so TaskMind can capture
              tasks from your apps.
            </Text>
          </View>
          <Text style={styles.permissionArrow}>›</Text>
        </Pressable>
      )}

      <Section title="Monitoring">
        <NavRow
          label="Notification Access"
          subtitle={
            permissionStatus === 'granted'
              ? '✓ Granted'
              : permissionStatus === 'denied'
                ? '✗ Not granted — tap to fix'
                : 'Checking…'
          }
          subtitleColor={permissionStatus === 'granted' ? Colors.success : undefined}
          onPress={handleGrantPermission}
        />
        <NavRow
          label="Monitored Apps"
          subtitle={
            activeAppCount === 0
              ? 'All apps (none selected)'
              : `${activeAppCount} app${activeAppCount !== 1 ? 's' : ''} active`
          }
          onPress={() => void router.push('/settings/monitored-apps')}
        />
        <NavRow
          label="VIP Contacts"
          subtitle={
            vipContacts.length === 0
              ? 'None set'
              : `${vipContacts.length} contact${vipContacts.length !== 1 ? 's' : ''}`
          }
          onPress={() => void router.push('/settings/vip-contacts')}
        />
      </Section>

      <Section title="Intelligence">
        <NavRow
          label="Priority Rules"
          subtitle="Rule-based mode"
          onPress={() => {
            Alert.alert(
              'Priority Rules',
              'TaskMind uses keyword matching to determine task priority.\n\nURGENT: deadline, urgent, asap, emergency\nHIGH: important, need, must, required\nMEDIUM: call, reply, check, update\nLOW: fyi, info, update\n\nVIP contacts always create URGENT tasks.',
              [{ text: 'OK' }]
            );
          }}
        />
        <NavRow
          label="Learned Vocabulary"
          onPress={() => void router.push('/settings/vocabulary')}
        />
      </Section>

      <Section title="Nudges">
        <NavRow
          label="Nudge Schedule"
          subtitle={nudgeLabel}
          onPress={() => void router.push('/settings/nudges')}
        />
        <ToggleRow
          label="Urgent overrides quiet hours"
          value={urgentOverride}
          onChange={handleUrgentOverride}
        />
      </Section>

      <Section title="Reports">
        <NavRow
          label="Daily Email Report"
          subtitle={getSetting('email_enabled') ? 'Enabled' : 'Not configured'}
          onPress={() => void router.push('/settings/email-report')}
        />
      </Section>

      <Section title="Device">
        <NavRow
          label="Battery Optimization Guide"
          onPress={() => void router.push('/settings/battery-guide')}
        />
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
  subtitleColor,
  onPress,
}: {
  label: string;
  subtitle?: string;
  subtitleColor?: string;
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
        {subtitle && (
          <Text style={[styles.rowSubtitle, subtitleColor ? { color: subtitleColor } : undefined]}>
            {subtitle}
          </Text>
        )}
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
        thumbColor={Colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  content: { paddingBottom: 32 },
  permissionBanner: {
    margin: 16,
    backgroundColor: Colors.urgentBgLight,
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    borderLeftColor: Colors.urgentFg,
  },
  permissionBannerText: { flex: 1 },
  permissionTitle: { fontSize: 14, fontWeight: '600', color: Colors.urgentFg, marginBottom: 4 },
  permissionSubtitle: { fontSize: 13, color: Colors.urgentFg, lineHeight: 18, opacity: 0.85 },
  permissionArrow: { fontSize: 22, color: Colors.urgentFg, marginLeft: 8 },
  section: { marginTop: 24, marginHorizontal: 16 },
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
  rowPressed: { backgroundColor: Colors.surfaceVariantLight },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '400' },
  rowSubtitle: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginTop: 2 },
  chevron: { fontSize: 20, color: Colors.onSurfaceVariantLight, fontWeight: '300' },
  flex1: { flex: 1 },
  versionRow: { alignItems: 'center', marginTop: 32, marginBottom: 8 },
  versionText: { fontSize: 12, color: Colors.onSurfaceVariantLight },
});
