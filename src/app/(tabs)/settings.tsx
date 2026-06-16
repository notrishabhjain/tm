import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet, SafeAreaView } from 'react-native';
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
      <SafeAreaView style={[styles.safeArea, { backgroundColor: theme.background }]}>
        <ScrollView
          style={[styles.container, { backgroundColor: theme.background }]}
          contentContainerStyle={styles.content}
        >
          {/* Header */}
          <View
            style={[
              styles.screenHeader,
              { backgroundColor: theme.surface, borderBottomColor: theme.outline },
            ]}
          >
            <Text style={[styles.screenTitle, { color: theme.onSurface }]}>Settings</Text>
          </View>

          {/* Permission banner */}
          {permissionStatus === 'denied' && (
            <Pressable style={styles.permissionBanner} onPress={handleGrantPermission}>
              <Text style={styles.permissionBannerIcon}>⚠</Text>
              <View style={styles.permissionBannerText}>
                <Text style={styles.permissionTitle}>Notification Access Required</Text>
                <Text style={styles.permissionSubtitle}>
                  Tap to grant access so TaskMind can capture tasks from your apps.
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
              icon="🔔"
              isFirst
              onPress={handleGrantPermission}
            />
            <NavRow
              label="Monitored Apps"
              subtitle={
                activeAppCount === 0
                  ? 'All apps'
                  : `${activeAppCount} app${activeAppCount !== 1 ? 's' : ''} active`
              }
              icon="📱"
              onPress={() => void router.push('/settings/monitored-apps')}
            />
            <NavRow
              label="VIP Contacts"
              subtitle={
                vipContacts.length === 0
                  ? 'None set'
                  : `${vipContacts.length} contact${vipContacts.length !== 1 ? 's' : ''}`
              }
              icon="⭐"
              isLast
              onPress={() => void router.push('/settings/vip-contacts')}
            />
          </Section>

          <Section title="Intelligence">
            <NavRow
              label="Cloud AI"
              subtitle={aiEnabled ? 'NVIDIA · enabled' : 'Off — on-device only'}
              icon="☁️"
              isFirst
              onPress={() => void router.push('/settings/ai-cloud')}
            />
            <NavRow
              label="Focus Lock"
              subtitle="Block distracting apps"
              icon="🔒"
              onPress={() => void router.push('/settings/focus-lock')}
            />
            <NavRow
              label="Signal Engine"
              subtitle="17-signal local scorer"
              icon="⚡"
              onPress={() => void router.push('/settings/ai-model')}
            />
            <NavRow
              label="Learned Vocabulary"
              icon="📝"
              onPress={() => void router.push('/settings/vocabulary')}
            />
            <NavRow
              label="Analytics"
              subtitle="Decision log, accuracy"
              icon="📊"
              onPress={() => void router.push('/settings/analytics')}
            />
            <NavRow
              label="Analyze Text"
              subtitle="Extract tasks from long text"
              icon="🔍"
              isLast
              onPress={() => void router.push('/settings/transcript-import')}
            />
          </Section>

          <Section title="Integrations">
            <NavRow
              label="Google Tasks"
              subtitle={googleTasksConnected ? 'Connected · syncing' : 'Sync to Google Tasks'}
              subtitleColor={googleTasksConnected ? Colors.success : undefined}
              icon="✅"
              isFirst
              onPress={() => void router.push('/settings/google-tasks')}
            />
            <NavRow
              label="Call Transcription"
              subtitle="On-device, no Termux needed"
              icon="📞"
              onPress={() => void router.push('/settings/in-app-transcription')}
            />
            <NavRow
              label="Call Transcription (legacy)"
              subtitle="Termux + MacroDroid setup"
              icon="🔧"
              isLast
              onPress={() => void router.push('/settings/call-transcription')}
            />
          </Section>

          <Section title="Nudges">
            <NavRow
              label="Nudge Schedule"
              subtitle={nudgeLabel}
              icon="⏰"
              isFirst
              onPress={() => void router.push('/settings/nudges')}
            />
            <ToggleRow
              label="Urgent overrides quiet hours"
              value={urgentOverride}
              onChange={handleUrgentOverride}
              isLast
            />
          </Section>

          <Section title="Reports">
            <NavRow
              label="Task Report"
              subtitle="Export CSV or JSON"
              icon="📄"
              isFirst
              onPress={() => void router.push('/settings/email-report')}
            />
            <NavRow
              label="Export / Import"
              subtitle="JSON or CSV"
              icon="💾"
              isLast
              onPress={() => void router.push('/settings/export-import')}
            />
          </Section>

          <Section title="Device">
            <NavRow
              label="Battery Optimization"
              icon="🔋"
              isFirst
              isLast
              onPress={() => void router.push('/settings/battery-guide')}
            />
          </Section>

          <Section title="Developer">
            <NavRow
              label="Diagnostics"
              subtitle="Capture log, notification debug"
              icon="🐛"
              isFirst
              isLast
              onPress={() => void router.push('/settings/diagnostics')}
            />
          </Section>

          <View style={styles.versionRow}>
            <Text style={[styles.versionText, { color: theme.onSurfaceVariant }]}>
              TaskMind v0.1.0 · {process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
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
      <View style={[styles.sectionCard, { backgroundColor: t.surface }]}>{children}</View>
    </View>
  );
}

function NavRow({
  label,
  subtitle,
  subtitleColor,
  icon,
  isFirst,
  isLast,
  onPress,
}: {
  label: string;
  subtitle?: string;
  subtitleColor?: string;
  icon?: string;
  isFirst?: boolean;
  isLast?: boolean;
  onPress: () => void;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        !isFirst && { borderTopWidth: 1, borderTopColor: t.outline },
        isFirst && styles.rowFirst,
        isLast && styles.rowLast,
        pressed && { backgroundColor: t.pressHighlight },
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      {icon && <Text style={styles.rowIcon}>{icon}</Text>}
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
  isFirst,
  isLast,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  isFirst?: boolean;
  isLast?: boolean;
}): React.JSX.Element {
  const t = useTheme();
  return (
    <View
      style={[
        styles.row,
        !isFirst && { borderTopWidth: 1, borderTopColor: t.outline },
        isFirst && styles.rowFirst,
        isLast && styles.rowLast,
      ]}
    >
      <Text style={[styles.rowLabel, styles.flex1, { color: t.onSurface }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.primary900, false: t.outline }}
        thumbColor={Colors.white}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { flex: 1 },
  content: { paddingBottom: 40 },

  screenHeader: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  screenTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },

  permissionBanner: {
    margin: 16,
    borderRadius: 12,
    backgroundColor: Colors.urgentBgLight,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  permissionBannerIcon: { fontSize: 20 },
  permissionBannerText: { flex: 1 },
  permissionTitle: { fontSize: 14, fontWeight: '700', color: Colors.urgentFg, marginBottom: 2 },
  permissionSubtitle: { fontSize: 12, color: Colors.urgentFg, lineHeight: 17, opacity: 0.9 },
  permissionArrow: { fontSize: 22, color: Colors.urgentFg },

  section: { marginTop: 28, marginHorizontal: 16 },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  sectionCard: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
    minHeight: 52,
  },
  rowFirst: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  rowLast: { borderBottomLeftRadius: 14, borderBottomRightRadius: 14 },
  rowIcon: { fontSize: 18, marginRight: 12, width: 24, textAlign: 'center' },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSubtitle: { fontSize: 12, marginTop: 1 },
  chevron: { fontSize: 20 },
  flex1: { flex: 1 },

  versionRow: { alignItems: 'center', marginTop: 32, marginBottom: 8 },
  versionText: { fontSize: 12 },
});
