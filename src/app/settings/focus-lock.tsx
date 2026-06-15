import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Switch, StyleSheet, ScrollView } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import NotificationListener from '../../../modules/notification-listener/src';
import type { FocusState } from '../../../modules/notification-listener/src';

const DEPTH = 4;

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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Focus Lock</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.disclosureCard, { borderColor: Colors.highFg }]}>
          <Text style={styles.disclosureTitle}>How it works</Text>
          <Text style={[styles.disclosureBody, { color: theme.onSurfaceVariant }]}>
            When you have an URGENT task pending (or a focus session is running), opening a
            distracting app shows a reminder. Keep scrolling past 5 minutes and it escalates to a
            full block until you finish a task or use a timed bypass.
          </Text>
        </View>

        {/* Permission setup */}
        {needsSetup && (
          <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
            <View style={styles.sectionShadow} />
            <View
              style={[
                styles.sectionCard,
                { backgroundColor: theme.surface, borderColor: Colors.urgentFg },
              ]}
            >
              <Text style={[styles.sectionLabelInline, { color: Colors.urgentFg }]}>
                PERMISSIONS REQUIRED
              </Text>
              {!state?.accessibilityEnabled && (
                <Pressable
                  onPress={() => void NotificationListener.openAccessibilitySettings()}
                  style={[styles.permBtn, { borderColor: theme.outline }]}
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
                  style={[styles.permBtn, { borderColor: theme.outline }]}
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
          </View>
        )}

        {/* Auto-lock toggle */}
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900 },
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
                trackColor={{ true: Colors.primary900, false: theme.outline }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </View>

        {/* Manual focus session */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>FOCUS SESSION</Text>
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900 },
            ]}
          >
            {sessionActive ? (
              <>
                <Text style={[styles.rowLabel, { color: theme.onSurface }]}>
                  Session active · {formatRemaining(state?.sessionEndsAt ?? 0)}
                </Text>
                <Pressable
                  onPress={handleEndSession}
                  style={[
                    styles.btn,
                    {
                      backgroundColor: Colors.urgentFg,
                      borderColor: Colors.urgentFg,
                      marginTop: 12,
                    },
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
                      style={[styles.durationBtn, { borderColor: Colors.primary900 }]}
                    >
                      <Text style={[styles.durationText, { color: Colors.primary900 }]}>{d}m</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </View>
        </View>

        {/* Blocked apps */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>BLOCKED APPS</Text>
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900, padding: 0 },
            ]}
          >
            {PRESET_APPS.map((app, i) => (
              <View
                key={app.id}
                style={[
                  styles.appRow,
                  i > 0 && { borderTopWidth: 1, borderTopColor: theme.outline },
                ]}
              >
                <Text style={[styles.appLabel, { color: theme.onSurface }]}>{app.label}</Text>
                <Switch
                  value={blockApps.includes(app.id)}
                  onValueChange={() => handleToggleApp(app.id)}
                  trackColor={{ true: Colors.primary900, false: theme.outline }}
                  thumbColor={Colors.white}
                />
              </View>
            ))}
          </View>
        </View>

        <Text style={[styles.footnote, { color: theme.onSurfaceVariant }]}>
          Bypasses left today: {state?.bypassesLeft ?? 0} of {state?.maxBypasses ?? 3}. A bypass
          grants 5 minutes of access. Completing a task always unlocks immediately.
        </Text>
        <Pressable onPress={refresh} style={{ marginTop: 8 }}>
          <Text style={[styles.refreshText, { color: theme.primary }]}>Refresh status</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primary900,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
  },
  backBtn: { padding: 4, minWidth: 56 },
  backText: { fontSize: 15, color: Colors.white, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '800', color: Colors.white },
  content: { padding: 16, paddingBottom: 48, gap: 8 },

  disclosureCard: {
    borderWidth: 1.5,
    borderRadius: 2,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#FFFBF0',
  },
  disclosureTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.highFg,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  disclosureBody: { fontSize: 12, lineHeight: 18 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 8,
  },
  sectionLabelInline: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, marginBottom: 10 },
  sectionWrapper: { position: 'relative' },
  sectionShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  sectionCard: { borderWidth: 2, borderRadius: 2, padding: 14 },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },

  permBtn: { borderWidth: 1.5, borderRadius: 2, padding: 12, marginBottom: 8 },
  permBtnText: { fontSize: 14, fontWeight: '700' },
  permBtnSub: { fontSize: 12, marginTop: 2 },

  btn: {
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnTextLight: { fontSize: 13, fontWeight: '700', color: Colors.white },

  durationRow: { flexDirection: 'row', gap: 10 },
  durationBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    paddingVertical: 12,
    alignItems: 'center',
  },
  durationText: { fontSize: 15, fontWeight: '800' },

  appRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  appLabel: { fontSize: 14, fontWeight: '600' },

  footnote: { fontSize: 12, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
  refreshText: { fontSize: 13, fontWeight: '700', paddingHorizontal: 4 },
});
