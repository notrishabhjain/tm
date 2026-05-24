import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { getSetting, setSetting } from '@/data/storage/settings';
import { db } from '@/data/db/client';
import { MonitoredAppRepository } from '@/data/repositories/MonitoredAppRepository';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import NotificationListener from '../../../modules/notification-listener/src';

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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Notification Permission banner */}
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

      <Section
        title="Monitoring"
        surfaceColor={theme.surface}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      >
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
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
        <NavRow
          label="Monitored Apps"
          subtitle={
            activeAppCount === 0
              ? 'All apps (none selected)'
              : `${activeAppCount} app${activeAppCount !== 1 ? 's' : ''} active`
          }
          onPress={() => void router.push('/settings/monitored-apps')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
        <NavRow
          label="VIP Contacts"
          subtitle={
            vipContacts.length === 0
              ? 'None set'
              : `${vipContacts.length} contact${vipContacts.length !== 1 ? 's' : ''}`
          }
          onPress={() => void router.push('/settings/vip-contacts')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
      </Section>

      <Section
        title="Intelligence"
        surfaceColor={theme.surface}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      >
        <NavRow
          label="Signal Engine"
          subtitle="17-signal deterministic scorer, no AI models"
          onPress={() => void router.push('/settings/ai-model')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
        <NavRow
          label="Learned Vocabulary"
          onPress={() => void router.push('/settings/vocabulary')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
        <NavRow
          label="Analytics"
          subtitle="Decision log, accuracy"
          onPress={() => void router.push('/settings/analytics')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
        <NavRow
          label="Analyze Text"
          subtitle="Extract tasks from long text"
          onPress={() => void router.push('/settings/transcript-import')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
      </Section>

      <Section
        title="Nudges"
        surfaceColor={theme.surface}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      >
        <NavRow
          label="Nudge Schedule"
          subtitle={nudgeLabel}
          onPress={() => void router.push('/settings/nudges')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
        <ToggleRow
          label="Urgent overrides quiet hours"
          value={urgentOverride}
          onChange={handleUrgentOverride}
          onSurfaceColor={theme.onSurface}
          outlineColor={theme.outline}
        />
      </Section>

      <Section
        title="Reports"
        surfaceColor={theme.surface}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      >
        <NavRow
          label="Daily Email Report"
          subtitle={getSetting('email_enabled') ? 'Enabled' : 'Not configured'}
          onPress={() => void router.push('/settings/email-report')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
        <NavRow
          label="Export / Import"
          subtitle="JSON or CSV"
          onPress={() => void router.push('/settings/export-import')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
      </Section>

      <Section
        title="Device"
        surfaceColor={theme.surface}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      >
        <NavRow
          label="Battery Optimization Guide"
          onPress={() => void router.push('/settings/battery-guide')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
      </Section>

      <Section
        title="Debug"
        surfaceColor={theme.surface}
        outlineColor={theme.outline}
        onSurfaceColor={theme.onSurface}
        onSurfaceVariantColor={theme.onSurfaceVariant}
      >
        <NavRow
          label="Diagnostics"
          subtitle="Notification capture, extraction log"
          onPress={() => void router.push('/settings/diagnostics')}
          onSurfaceColor={theme.onSurface}
          onSurfaceVariantColor={theme.onSurfaceVariant}
          outlineColor={theme.outline}
        />
      </Section>

      <View style={styles.versionRow}>
        <Text style={[styles.versionText, { color: theme.onSurfaceVariant }]}>
          TaskMind v0.1.0 · {process.env['EXPO_PUBLIC_COMMIT_SHA'] ?? 'dev'}
        </Text>
      </View>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  surfaceColor,
  outlineColor: _outlineColor,
  onSurfaceColor: _onSurfaceColor,
  onSurfaceVariantColor: _onSurfaceVariantColor,
}: {
  title: string;
  children: React.ReactNode;
  surfaceColor: string;
  outlineColor: string;
  onSurfaceColor: string;
  onSurfaceVariantColor: string;
}): React.JSX.Element {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={[styles.sectionCard, { backgroundColor: surfaceColor }]}>{children}</View>
    </View>
  );
}

function NavRow({
  label,
  subtitle,
  subtitleColor,
  onPress,
  onSurfaceColor,
  onSurfaceVariantColor,
  outlineColor,
}: {
  label: string;
  subtitle?: string;
  subtitleColor?: string;
  onPress: () => void;
  onSurfaceColor: string;
  onSurfaceVariantColor: string;
  outlineColor: string;
}): React.JSX.Element {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: outlineColor },
        pressed && styles.rowPressed,
      ]}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, { color: onSurfaceColor }]}>{label}</Text>
        {subtitle && (
          <Text style={[styles.rowSubtitle, { color: subtitleColor ?? onSurfaceVariantColor }]}>
            {subtitle}
          </Text>
        )}
      </View>
      <Text style={[styles.chevron, { color: onSurfaceVariantColor }]}>›</Text>
    </Pressable>
  );
}

function ToggleRow({
  label,
  value,
  onChange,
  onSurfaceColor,
  outlineColor,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  onSurfaceColor: string;
  outlineColor: string;
}): React.JSX.Element {
  return (
    <View style={[styles.row, { borderBottomColor: outlineColor }]}>
      <Text style={[styles.rowLabel, styles.flex1, { color: onSurfaceColor }]}>{label}</Text>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ true: Colors.primary900, false: outlineColor }}
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
    color: Colors.primary900,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginLeft: 2,
  },
  sectionCard: {
    borderWidth: 2,
    borderColor: Colors.primary900,
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
  rowPressed: { backgroundColor: Colors.primary50 },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowSubtitle: { fontSize: 12, marginTop: 2 },
  chevron: { fontSize: 20, fontWeight: '700' },
  flex1: { flex: 1 },
  versionRow: { alignItems: 'center', marginTop: 32, marginBottom: 8 },
  versionText: { fontSize: 12 },
});
