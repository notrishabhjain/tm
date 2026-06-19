import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { getSetting, setSetting } from '@/data/storage/settings';
import { db } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import NotificationListener from '../../../modules/notification-listener/src';
import { SwipeNavigator } from '@/ui/components/SwipeNavigator';

const monitoredRepo = new MonitoredAppRepository(db);
const vipRepo = new VipContactRepository(db);

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

export default function SettingsScreen(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const [permissionStatus, setPermissionStatus] = useState<'granted' | 'denied' | 'unknown'>(
    'unknown'
  );
  const [urgentOverride, setUrgentOverride] = useState(getSetting('urgent_override_quiet'));
  const [aiEnabled, setAiEnabled] = useState(getSetting('ai_enabled'));
  const [googleTasksConnected, setGoogleTasksConnected] = useState(
    getSetting('google_tasks_enabled')
  );
  const [nudgeFreq, setNudgeFreq] = useState(getSetting('nudge_freq_minutes'));

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

  useFocusEffect(
    useCallback(() => {
      void checkPermission();
      setAiEnabled(getSetting('ai_enabled'));
      setGoogleTasksConnected(getSetting('google_tasks_enabled'));
      setNudgeFreq(getSetting('nudge_freq_minutes'));
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
      <Screen>
        <LargeHeader title="Settings" />
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {permissionStatus === 'denied' && (
            <Pressable style={styles.banner} onPress={handleGrantPermission}>
              <Ionicons name="alert-circle" size={22} color={Colors.urgentFg} />
              <View style={styles.bannerText}>
                <Text style={styles.bannerTitle}>Notification access required</Text>
                <Text style={styles.bannerSubtitle}>
                  Tap to grant access so TaskMind can capture tasks from your apps.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.urgentFg} />
            </Pressable>
          )}

          <Section title="Monitoring">
            <Row
              icon="notifications-outline"
              tint={Colors.urgentFg}
              label="Notification Access"
              value={
                permissionStatus === 'granted' ? 'On' : permissionStatus === 'denied' ? 'Off' : '…'
              }
              valueColor={permissionStatus === 'granted' ? Colors.success : Colors.urgentFg}
              isFirst
              onPress={handleGrantPermission}
            />
            <Row
              icon="apps-outline"
              tint={Colors.mediumFg}
              label="Monitored Apps"
              value={activeAppCount === 0 ? 'All' : `${activeAppCount}`}
              onPress={() => void router.push('/settings/monitored-apps')}
            />
            <Row
              icon="star-outline"
              tint={Colors.highFg}
              label="VIP Contacts"
              value={vipContacts.length === 0 ? 'None' : `${vipContacts.length}`}
              isLast
              onPress={() => void router.push('/settings/vip-contacts')}
            />
          </Section>

          <Section title="Intelligence">
            <Row
              icon="cloud-outline"
              tint={Colors.mediumFg}
              label="Cloud AI"
              value={aiEnabled ? 'On' : 'Off'}
              valueColor={aiEnabled ? Colors.success : undefined}
              isFirst
              onPress={() => void router.push('/settings/ai-cloud')}
            />
            <Row
              icon="lock-closed-outline"
              tint={Colors.primary500}
              label="Focus Lock"
              onPress={() => void router.push('/settings/focus-lock')}
            />
            <Row
              icon="flash-outline"
              tint={Colors.highFg}
              label="Signal Engine"
              onPress={() => void router.push('/settings/ai-model')}
            />
            <Row
              icon="book-outline"
              tint={Colors.primary500}
              label="Learned Vocabulary"
              onPress={() => void router.push('/settings/vocabulary')}
            />
            <Row
              icon="stats-chart-outline"
              tint={Colors.success}
              label="Analytics"
              onPress={() => void router.push('/settings/analytics')}
            />
            <Row
              icon="search-outline"
              tint={Colors.mediumFg}
              label="Analyze Text"
              isLast
              onPress={() => void router.push('/settings/transcript-import')}
            />
          </Section>

          <Section title="Integrations">
            <Row
              icon="checkbox-outline"
              tint={Colors.success}
              label="Google Tasks"
              value={googleTasksConnected ? 'Synced' : 'Off'}
              valueColor={googleTasksConnected ? Colors.success : undefined}
              isFirst
              onPress={() => void router.push('/settings/google-tasks')}
            />
            <Row
              icon="call-outline"
              tint={Colors.primary500}
              label="Call Transcription"
              isLast
              onPress={() => void router.push('/settings/in-app-transcription')}
            />
          </Section>

          <Section title="Nudges">
            <Row
              icon="alarm-outline"
              tint={Colors.highFg}
              label="Nudge Schedule"
              value={nudgeLabel}
              isFirst
              onPress={() => void router.push('/settings/nudges')}
            />
            <ToggleRow
              icon="moon-outline"
              tint={Colors.mediumFg}
              label="Urgent overrides quiet hours"
              value={urgentOverride}
              onChange={handleUrgentOverride}
              isLast
            />
          </Section>

          <Section title="Reports">
            <Row
              icon="document-text-outline"
              tint={Colors.mediumFg}
              label="Task Report"
              isFirst
              onPress={() => void router.push('/settings/email-report')}
            />
            <Row
              icon="save-outline"
              tint={Colors.lowFg}
              label="Export / Import"
              isLast
              onPress={() => void router.push('/settings/export-import')}
            />
          </Section>

          <Section title="Device">
            <Row
              icon="battery-charging-outline"
              tint={Colors.success}
              label="Battery Optimization"
              isFirst
              isLast
              onPress={() => void router.push('/settings/battery-guide')}
            />
          </Section>

          <Section title="Developer">
            <Row
              icon="bug-outline"
              tint={Colors.lowFg}
              label="Diagnostics"
              isFirst
              isLast
              onPress={() => void router.push('/settings/diagnostics')}
            />
          </Section>

          <Text style={[styles.version, { color: theme.onSurfaceVariant }]}>
            TaskMind v0.1.0 · {process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev'}
          </Text>
        </ScrollView>
      </Screen>
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
      <Text style={[styles.sectionTitle, { color: t.onSurfaceVariant }]}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: t.surface, borderColor: t.outline }]}>
        {children}
      </View>
    </View>
  );
}

function Row({
  icon,
  tint,
  label,
  value,
  valueColor,
  isFirst,
  onPress,
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value?: string;
  valueColor?: string;
  isFirst?: boolean;
  isLast?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !isFirst && { borderTopWidth: 0.5, borderTopColor: t.outline },
        pressed && { backgroundColor: t.surfaceVariant },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={[styles.iconBox, { backgroundColor: tint + '1A' }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
      <Text style={[styles.rowLabel, { color: t.onSurface }]}>{label}</Text>
      {value ? (
        <Text style={[styles.rowValue, { color: valueColor ?? t.onSurfaceVariant }]}>{value}</Text>
      ) : null}
      <Ionicons
        name="chevron-forward"
        size={17}
        color={t.onSurfaceVariant}
        style={styles.chevron}
      />
    </Pressable>
  );
}

function ToggleRow({
  icon,
  tint,
  label,
  value,
  onChange,
  isFirst,
}: {
  icon: IoniconName;
  tint: string;
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View style={[styles.row, !isFirst && { borderTopWidth: 0.5, borderTopColor: t.outline }]}>
      <View style={[styles.iconBox, { backgroundColor: tint + '1A' }]}>
        <Ionicons name={icon} size={17} color={tint} />
      </View>
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
  content: { paddingBottom: 40 },

  banner: {
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: Colors.urgentBgLight,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: Colors.urgentFg, marginBottom: 2 },
  bannerSubtitle: { fontSize: 12, color: Colors.urgentFg, lineHeight: 17, opacity: 0.9 },

  section: { marginTop: 24, marginHorizontal: 20 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginLeft: 4,
    letterSpacing: 0.1,
  },
  sectionCard: { borderRadius: 16, borderWidth: 0.5, overflow: 'hidden' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 54,
  },
  iconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  rowLabel: { fontSize: 16, fontWeight: '400', flex: 1 },
  rowValue: { fontSize: 15, marginRight: 6 },
  chevron: { marginLeft: 2 },
  flex1: { flex: 1 },

  version: { fontSize: 12, textAlign: 'center', marginTop: 28 },
});
