import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { getSetting, setSetting } from '@/data/storage/settings';
import { db } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import NotificationListener from '../../../modules/notification-listener/src';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';

const monitoredRepo = new MonitoredAppRepository(db);
const vipRepo = new VipContactRepository(db);

export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
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
    <SwipeNavigator tabIndex={3}>
      <ScrollView
        style={[styles.container, { backgroundColor: theme.background }]}
        contentContainerStyle={styles.content}
      >
        {permissionStatus === 'denied' && (
          <Pressable
            style={[styles.permissionBanner, { backgroundColor: theme.urgentBg }]}
            onPress={handleGrantPermission}
          >
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
                ? 'Granted'
                : permissionStatus === 'denied'
                  ? 'Not granted — tap to fix'
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
            label="Signal Engine"
            subtitle="17-signal deterministic scorer, no AI models"
            onPress={() => void router.push('/settings/ai-model')}
          />
          <NavRow
            label="Learned Vocabulary"
            onPress={() => void router.push('/settings/vocabulary')}
          />
          <NavRow
            label="Analytics"
            subtitle="Decision log, accuracy"
            onPress={() => void router.push('/settings/analytics')}
          />
          <NavRow
            label="Analyze Text"
            subtitle="Extract tasks from long text"
            onPress={() => void router.push('/settings/transcript-import')}
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
          <NavRow
            label="Export / Import"
            subtitle="JSON or CSV"
            onPress={() => void router.push('/settings/export-import')}
          />
        </Section>

        <Section title="Widget">
          <NavRow
            label="Pin Widget to Home Screen"
            subtitle="Shows pending tasks on your home screen"
            onPress={() => {
              void NotificationListener.requestPinWidget().then((supported) => {
                if (!supported) {
                  Alert.alert(
                    'Not Supported',
                    'Your launcher does not support pinning widgets programmatically. Long-press your home screen and add the TaskMind widget manually.'
                  );
                }
              });
            }}
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
          <Text style={[styles.versionText, { color: theme.onSurfaceVariant }]}>
            TaskMind v0.1.0 · {process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev'}
          </Text>
        </View>
      </ScrollView>
    </SwipeNavigator>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.primary }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: t.surface, borderColor: t.outline }]}>
        {children}
      </View>
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
  const t = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: t.outline },
        pressed && { backgroundColor: t.pressHighlight },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, { color: t.onSurface }]}>{label}</Text>
        {subtitle && (
          <Text style={[styles.rowSubtitle, { color: subtitleColor ?? t.onSurfaceVariant }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Text style={[styles.chevron, { color: t.onSurfaceVariant }]}>›</Text>
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
  const t = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: t.outline }]}>
      <Text style={[styles.rowLabel, styles.flex1, { color: t.onSurface }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.primary500, false: t.outline }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingBottom: 32 },
  permissionBanner: {
    margin: 16,
    borderWidth: 2,
    borderColor: Colors.urgentFg,
    borderRadius: 2,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  permissionBannerText: { flex: 1 },
  permissionTitle: { fontSize: 14, fontWeight: '700', color: Colors.urgentFg, marginBottom: 4 },
  permissionSubtitle: { fontSize: 13, color: Colors.urgentFg, lineHeight: 18, opacity: 0.85 },
  permissionArrow: { fontSize: 22, color: Colors.urgentFg, marginLeft: 8 },
  section: { marginTop: 24, marginHorizontal: 16 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionCard: {
    borderWidth: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    minHeight: 56,
    borderBottomWidth: 1,
  },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 20, fontWeight: '700' },
  flex1: { flex: 1 },
  versionRow: { alignItems: 'center', marginTop: 32, marginBottom: 8 },
  versionText: { fontSize: 12 },
});
