import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Switch, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import NotificationListener from '../../../modules/notification-listener/src';
import type { FocusState } from '../../../modules/notification-listener/src';

const PRESET_APPS: { id: string; label: string }[] = [
  { id: 'com.google.android.youtube', label: 'YouTube' },
  { id: 'com.android.chrome', label: 'Chrome' },
  { id: 'com.instagram.android', label: 'Instagram' },
  { id: 'com.zhiliaoapp.musically', label: 'TikTok' },
  { id: 'com.reddit.frontpage', label: 'Reddit' },
  { id: 'com.twitter.android', label: 'X (Twitter)' },
];

const SESSION_DURATIONS = [25, 50, 90];

function formatRemaining(endMs: number): string {
  const ms = endMs - Date.now();
  if (ms <= 0) return '';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `${mins} min left`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m left`;
}

export default function FocusLockScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  const [state, setState] = useState<FocusState | null>(null);
  const [blockApps, setBlockApps] = useState<string[]>([]);

  const refresh = useCallback(() => {
    void NotificationListener.focusGetState().then(setState);
    void NotificationListener.focusGetBlockApps().then(setBlockApps);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Force a re-render every 30s so the "X min left" countdown stays current
  // while a focus session is active.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!state || state.sessionEndsAt <= Date.now()) return;
    const interval = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(interval);
  }, [state]);

  const sessionActive = state != null && state.sessionEndsAt > Date.now();

  const handleToggleEnabled = useCallback(
    (val: boolean) => {
      void NotificationListener.focusSetEnabled(val).then(refresh);
    },
    [refresh]
  );

  const handleToggleApp = useCallback(
    (pkg: string) => {
      const next = blockApps.includes(pkg)
        ? blockApps.filter((p) => p !== pkg)
        : [...blockApps, pkg];
      setBlockApps(next);
      void NotificationListener.focusSetBlockApps(next);
    },
    [blockApps]
  );

  const handleStartSession = useCallback(
    (minutes: number) => {
      void NotificationListener.focusStartSession(minutes).then(refresh);
    },
    [refresh]
  );

  const handleEndSession = useCallback(() => {
    void NotificationListener.focusEndSession().then(refresh);
  }, [refresh]);

  const needsSetup = state != null && (!state.accessibilityEnabled || !state.hasOverlayPermission);

  return (
    <Screen>
      <LargeHeader title="Focus Lock" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.disclosureCard, { backgroundColor: Colors.highBgLight }]}>
          <Text style={[styles.disclosureTitle, { color: Colors.highFg }]}>How it works</Text>
          <Text style={[styles.disclosureBody, { color: theme.onSurfaceVariant }]}>
            When you have an URGENT task pending (or a focus session is running), opening a
            distracting app shows a reminder. Keep scrolling past 5 minutes and it escalates to a
            full block until you finish a task or use a timed bypass.
          </Text>
        </View>

        {/* Permission setup */}
        {needsSetup && (
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.urgentFg },
            ]}
          >
            <Text style={[styles.sectionLabelInline, { color: Colors.urgentFg }]}>
              Permissions required
            </Text>
            {!state?.accessibilityEnabled && (
              <Pressable
                onPress={() => void NotificationListener.openAccessibilitySettings()}
                style={({ pressed }) => [
                  styles.permBtn,
                  { borderColor: theme.outline },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.permBtnText, { color: theme.onSurface }]}>
                  1. Enable Accessibility access ›
                </Text>
                <Text style={[styles.permBtnSub, { color: theme.onSurfaceVariant }]}>
                  Lets TaskMind detect which app is open
                </Text>
              </Pressable>
            )}
            {!state?.hasOverlayPermission && (
              <Pressable
                onPress={() => void NotificationListener.requestOverlayPermission()}
                style={({ pressed }) => [
                  styles.permBtn,
                  { borderColor: theme.outline },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={[styles.permBtnText, { color: theme.onSurface }]}>
                  2. Allow display over other apps ›
                </Text>
                <Text style={[styles.permBtnSub, { color: theme.onSurfaceVariant }]}>
                  Lets TaskMind show the focus reminder/block
                </Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Auto-lock toggle */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.onSurface }]}>
                Auto-lock on urgent tasks
              </Text>
              <Text style={[styles.rowSub, { color: theme.onSurfaceVariant }]}>
                {state?.lockActive
                  ? 'Lock is active right now'
                  : 'Locks when an URGENT task is pending'}
              </Text>
            </View>
            <Switch
              value={state?.enabled ?? false}
              onValueChange={handleToggleEnabled}
              trackColor={{ true: Colors.primary500, false: theme.outline }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        {/* Manual focus session */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Focus session</Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        >
          {sessionActive ? (
            <>
              <Text style={[styles.rowLabel, { color: theme.onSurface }]}>
                Session active · {formatRemaining(state?.sessionEndsAt ?? 0)}
              </Text>
              <Pressable
                onPress={handleEndSession}
                style={({ pressed }) => [
                  styles.btn,
                  { backgroundColor: Colors.urgentFg, marginTop: 12 },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text style={styles.btnTextLight}>End session</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text style={[styles.rowSub, { color: theme.onSurfaceVariant, marginBottom: 10 }]}>
                Block distracting apps for a fixed time, regardless of tasks.
              </Text>
              <View style={styles.durationRow}>
                {SESSION_DURATIONS.map((d) => (
                  <Pressable
                    key={d}
                    onPress={() => handleStartSession(d)}
                    style={({ pressed }) => [
                      styles.durationBtn,
                      { backgroundColor: theme.surfaceVariant },
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={[styles.durationText, { color: Colors.primary500 }]}>{d}m</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Blocked apps */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Blocked apps</Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline, padding: 0 },
          ]}
        >
          {PRESET_APPS.map((app, i) => (
            <View
              key={app.id}
              style={[
                styles.appRow,
                i > 0 && { borderTopWidth: 0.5, borderTopColor: theme.outline },
              ]}
            >
              <Text style={[styles.appLabel, { color: theme.onSurface }]}>{app.label}</Text>
              <Switch
                value={blockApps.includes(app.id)}
                onValueChange={() => handleToggleApp(app.id)}
                trackColor={{ true: Colors.primary500, false: theme.outline }}
                thumbColor={Colors.white}
              />
            </View>
          ))}
        </View>

        <Text style={[styles.footnote, { color: theme.onSurfaceVariant }]}>
          Bypasses left today: {state?.bypassesLeft ?? 0} of {state?.maxBypasses ?? 3}. A bypass
          grants 5 minutes of access. Completing a task always unlocks immediately.
        </Text>
        <Pressable onPress={refresh} style={{ marginTop: 8 }}>
          <Text style={[styles.refreshText, { color: theme.primary }]}>Refresh status</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 12 },

  disclosureCard: {
    borderRadius: 16,
    padding: 16,
    marginBottom: 4,
  },
  disclosureTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  disclosureBody: { fontSize: 13, lineHeight: 19 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 2,
    marginTop: 4,
  },
  sectionLabelInline: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  sectionCard: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 13, marginTop: 2 },

  permBtn: { borderWidth: 0.5, borderRadius: 14, padding: 12, marginBottom: 8 },
  permBtnText: { fontSize: 14, fontWeight: '600' },
  permBtnSub: { fontSize: 12, marginTop: 2 },

  btn: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTextLight: { fontSize: 14, fontWeight: '600', color: Colors.white },

  durationRow: { flexDirection: 'row', gap: 10 },
  durationBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  durationText: { fontSize: 15, fontWeight: '700' },

  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  appLabel: { fontSize: 15, fontWeight: '500' },

  footnote: { fontSize: 12, lineHeight: 18, marginTop: 4, paddingHorizontal: 4 },
  refreshText: { fontSize: 14, fontWeight: '600', paddingHorizontal: 4 },
});
