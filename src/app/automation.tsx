import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { looksLikeTranscript } from '@/services/transcript-format';
import NotificationListener from '../../modules/notification-listener/src';
import type { AutomationStatus } from '../../modules/notification-listener/src/types';

/**
 * Runs and tunes the Recorder UI automation.
 *
 * The automation presses buttons in another app, so this screen is deliberately
 * explicit: it says what will happen before it happens, streams every step as it
 * runs, and can stop mid-run. It also carries the screen inspector, because a
 * script written against guessed labels will not work and the inspector is how
 * the real ones are found.
 */
export default function AutomationScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [recordingLabel, setRecordingLabel] = useState('');
  const [readOnScreen, setReadOnScreen] = useState(false);

  const refresh = useCallback(() => {
    void NotificationListener.getAutomationStatus()
      .then(setStatus)
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Steps stream in while the run is in progress; without this the screen would
  // sit blank for the minutes transcription takes.
  useEffect(() => {
    const sub = NotificationListener.addAutomationLogListener((e) => {
      setLog((prev) => [...prev, e.message].slice(-80));
    });
    return () => sub.remove();
  }, []);

  const enabled = status?.enabled === true && status?.connected === true;

  const runInspector = (): void => {
    setLog(['Reading the screen that was in front before you opened TaskMind…']);
    void (async () => {
      try {
        const dump = await NotificationListener.inspectForegroundScreen();
        if (dump.error) {
          setLog((prev) => [...prev, `✗ ${dump.error ?? 'inspection failed'}`]);
          return;
        }
        const lines = [`Package: ${dump.package || 'unknown'}`];
        for (const n of dump.nodes ?? []) {
          const parts: string[] = [];
          if (n.text) parts.push(`"${n.text}"`);
          if (n.desc) parts.push(`desc="${n.desc}"`);
          if (n.viewId) parts.push(n.viewId.split('/').pop() ?? n.viewId);
          if (n.clickable) parts.push('[tappable]');
          if (parts.length > 0)
            lines.push(`${'  '.repeat(Math.min(n.depth, 6))}${parts.join(' ')}`);
        }
        lines.push(`— ${dump.nodes?.length ?? 0} controls found —`);
        setLog(lines.slice(-200));
      } catch (e) {
        setLog((prev) => [...prev, `✗ ${e instanceof Error ? e.message : String(e)}`]);
      }
    })();
  };

  const copyLog = (): void => {
    void Clipboard.setStringAsync(log.join('\n')).then(() =>
      Alert.alert('Copied', 'The log is on your clipboard — paste it wherever you need it.')
    );
  };

  const startRun = (): void => {
    if (running) return;
    Alert.alert(
      'Run the automation?',
      'TaskMind will open your Recorder app and press the buttons itself. Do not touch the phone while it runs — your taps and its taps will fight each other.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Run',
          onPress: () => {
            setRunning(true);
            setLog(['Starting…']);
            void (async () => {
              try {
                const result = await NotificationListener.runRecorderAutomation(
                  recordingLabel.trim() || null,
                  readOnScreen
                );
                if (!result.ok) {
                  setLog((prev) => [...prev, `✗ ${result.error || 'the run did not finish'}`]);
                  setLog((prev) => [
                    ...prev,
                    'Tip: open the Recorder to the screen that failed, come back, and tap "Inspect last screen" to see what that control is really called.',
                  ]);
                  return;
                }
                // The clipboard is only readable while TaskMind has focus, which
                // is why the script ends by returning here.
                const captured = result.captured?.trim();
                const clip = captured || (await Clipboard.getStringAsync().catch(() => ''));
                if (clip && looksLikeTranscript(clip)) {
                  setLog((prev) => [...prev, '✓ Got the transcript — opening the importer']);
                  router.push({ pathname: '/import-transcript', params: { text: clip } });
                } else {
                  setLog((prev) => [
                    ...prev,
                    '✓ The run finished, but nothing that looks like a transcript came back.',
                  ]);
                }
              } catch (e) {
                setLog((prev) => [...prev, `✗ ${e instanceof Error ? e.message : String(e)}`]);
              } finally {
                setRunning(false);
              }
            })();
          },
        },
      ]
    );
  };

  const stopRun = (): void => {
    void NotificationListener.abortAutomation().catch(() => {});
    setLog((prev) => [...prev, 'Stopping…']);
  };

  return (
    <Screen>
      <LargeHeader
        title="Automation"
        subtitle="Let TaskMind drive the Recorder app"
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <View style={styles.row}>
            <Ionicons
              name={enabled ? 'checkmark-circle' : 'alert-circle-outline'}
              size={20}
              color={enabled ? theme.primary : '#B45309'}
            />
            <Text style={[styles.h, { color: theme.onSurface }]}>
              {enabled ? 'Automation is enabled' : 'Automation is off'}
            </Text>
          </View>
          <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
            {enabled
              ? 'TaskMind can open your Recorder and press its buttons for you.'
              : 'Turn on TaskMind in Android’s Accessibility settings. That permission lets it press buttons in other apps — it is only used during a run you start here.'}
          </Text>
          {!enabled && (
            <Pressable
              onPress={() => void NotificationListener.openAccessibilitySettings()}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: theme.outline },
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="settings-outline" size={16} color={theme.primary} />
              <Text style={[styles.btnText, { color: theme.onSurface }]}>
                Open Accessibility settings
              </Text>
            </Pressable>
          )}
          <Text style={[styles.small, { color: theme.onSurfaceVariant }]}>
            Recorder app:{' '}
            {status?.recorderFound ? status.recorderPackage : 'not found on this device'}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <Text style={[styles.h, { color: theme.onSurface }]}>Before it will work</Text>
          <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
            The script guesses what your Recorder’s buttons are called. Those guesses are probably
            wrong on your firmware, and there is no way to know from here.
          </Text>
          <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
            Open the Recorder to a screen, switch back to TaskMind, and tap Inspect. It lists every
            control on that screen with its real label. Send me those and the script gets corrected.
          </Text>
          <Pressable
            onPress={runInspector}
            disabled={!enabled}
            style={({ pressed }) => [
              styles.btn,
              { borderColor: theme.outline },
              (pressed || !enabled) && { opacity: 0.6 },
            ]}
            accessibilityRole="button"
          >
            <Ionicons name="scan-outline" size={16} color={theme.primary} />
            <Text style={[styles.btnText, { color: theme.onSurface }]}>Inspect last screen</Text>
          </Pressable>
        </View>

        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <Text style={[styles.h, { color: theme.onSurface }]}>Run it</Text>
          <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
            Which recording? Leave blank to use the newest one.
          </Text>
          <TextInput
            value={recordingLabel}
            onChangeText={setRecordingLabel}
            placeholder="e.g. a name or date shown in the list"
            placeholderTextColor={theme.onSurfaceVariant}
            style={[styles.input, { color: theme.onSurface, borderColor: theme.outline }]}
            accessibilityLabel="Recording to open"
          />

          <Pressable
            onPress={() => setReadOnScreen((v) => !v)}
            style={styles.checkRow}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: readOnScreen }}
          >
            <Ionicons
              name={readOnScreen ? 'checkbox' : 'square-outline'}
              size={20}
              color={readOnScreen ? theme.primary : theme.onSurfaceVariant}
            />
            <Text style={[styles.small, { color: theme.onSurfaceVariant, flex: 1 }]}>
              Read the text off the screen instead of using the ⋮ → Copy menu. Fewer buttons to get
              right, but only captures what is visible.
            </Text>
          </Pressable>

          <View style={styles.actions}>
            <Pressable
              onPress={startRun}
              disabled={!enabled || running}
              style={({ pressed }) => [
                styles.primaryBtn,
                { backgroundColor: theme.primary },
                (pressed || !enabled || running) && { opacity: 0.5 },
              ]}
              accessibilityRole="button"
            >
              <Text style={[styles.primaryBtnText, { color: theme.background }]}>
                {running ? 'Running…' : 'Run automation'}
              </Text>
            </Pressable>
            {running && (
              <Pressable
                onPress={stopRun}
                style={({ pressed }) => [
                  styles.btn,
                  { borderColor: theme.outline, flex: 0, paddingHorizontal: 16 },
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.btnText, { color: theme.onSurface }]}>Stop</Text>
              </Pressable>
            )}
          </View>
        </View>

        {log.length > 0 && (
          <View
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <View style={styles.row}>
              <Text style={[styles.h, { color: theme.onSurface, flex: 1 }]}>What happened</Text>
              <Pressable onPress={copyLog} hitSlop={8} accessibilityRole="button">
                <Text style={[styles.small, { color: theme.primary }]}>Copy</Text>
              </Pressable>
            </View>
            <ScrollView style={styles.logBox} nestedScrollEnabled>
              {log.map((line, i) => (
                <Text key={i} style={[styles.logLine, { color: theme.onSurfaceVariant }]}>
                  {line}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48, gap: 14 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  h: { fontSize: 15, fontWeight: '700' },
  p: { fontSize: 13, lineHeight: 19 },
  small: { fontSize: 12, lineHeight: 17 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  actions: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
  },
  btnText: { fontSize: 13.5, fontWeight: '600' },
  primaryBtn: { flex: 1, paddingVertical: 13, borderRadius: 11, alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  logBox: { maxHeight: 320 },
  logLine: { fontSize: 11.5, fontFamily: 'monospace', lineHeight: 16 },
});
