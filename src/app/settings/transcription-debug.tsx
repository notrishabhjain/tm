import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { Button } from '@/ui/components/Button';
import NotificationListener from '../../../modules/notification-listener/src';
import type {
  CallDiagnostics,
  CallTranscriptionTestResult,
} from '../../../modules/notification-listener/src';

interface LogEntry {
  stage: string;
  message: string;
  ts: number;
}

function fmtAge(ms: number | null | undefined): string {
  if (ms == null) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.round(m / 60)}h ago`;
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const STAGE_LABEL: Record<string, string> = {
  find: 'Find recording',
  model: 'Load model',
  engine: 'Engine',
  decode: 'Decode audio',
  transcribe: 'Transcribe',
};

export default function TranscriptionDebugScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [diag, setDiag] = useState<CallDiagnostics | null>(null);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [testResult, setTestResult] = useState<CallTranscriptionTestResult | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [simulateStatus, setSimulateStatus] = useState<string | null>(null);
  const [receivedTranscript, setReceivedTranscript] = useState<string | null>(null);
  const elapsedRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const logScrollRef = useRef<ScrollView>(null);

  const refresh = useCallback(() => {
    void NotificationListener.getCallDiagnostics().then(setDiag);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  // Real-time log events from native during runCallTranscriptionTest
  useEffect(() => {
    const sub = NotificationListener.addCallTranscriptionTestLogListener((data) => {
      setLogs((prev) => [...prev, data]);
      setTimeout(() => logScrollRef.current?.scrollToEnd({ animated: true }), 50);
    });
    return () => sub.remove();
  }, []);

  // Listen for transcript-ready so simulate can show the result inline
  useEffect(() => {
    const sub = NotificationListener.addCallTranscriptReadyListener((data) => {
      setReceivedTranscript(data.text);
      setSimulateStatus(
        `Transcript received from ${data.callerLabel} — review screen should appear`
      );
    });
    return () => sub.remove();
  }, []);

  // Elapsed timer while test is running
  useEffect(() => {
    if (running) {
      setElapsed(0);
      elapsedRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (elapsedRef.current) {
        clearInterval(elapsedRef.current);
        elapsedRef.current = null;
      }
    }
    return () => {
      if (elapsedRef.current) clearInterval(elapsedRef.current);
    };
  }, [running]);

  const runTest = async (): Promise<void> => {
    setRunning(true);
    setTestResult(null);
    setLogs([]);
    try {
      const result = await NotificationListener.runCallTranscriptionTest();
      setTestResult(result);
    } catch (e) {
      setTestResult({
        ok: false,
        stage: 'engine',
        error: e instanceof Error ? e.message : 'Test threw an error',
      });
    } finally {
      setRunning(false);
      refresh();
    }
  };

  const simulate = async (): Promise<void> => {
    setSimulateStatus('Starting transcription service — this will take several minutes…');
    setReceivedTranscript(null);
    await NotificationListener.simulateCallEnded();
    setTimeout(refresh, 1000);
  };

  return (
    <Screen>
      <LargeHeader title="Transcription Debug" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: theme.onSurfaceVariant }]}>
          Live view of every step in the call-transcription pipeline. Logs appear in real-time as
          each stage runs.
        </Text>

        {/* ── Prerequisites ─────────────────────────────────────────── */}
        <Section theme={theme} title="Prerequisites">
          <Flag theme={theme} label="Transcription enabled" ok={diag?.enabled} />
          <Flag
            theme={theme}
            label="Call-end trigger registered"
            ok={diag?.monitorRegistered}
            hint="If off: grant phone permission then toggle transcription off/on."
          />
          <Flag
            theme={theme}
            label="Foreground service running"
            ok={diag?.foregroundServiceRunning}
          />
          <Flag
            theme={theme}
            label="Phone & call-log permission"
            ok={diag?.hasPhoneStatePermission}
          />
          <Flag theme={theme} label="Call-log read permission" ok={diag?.hasCallLogPermission} />
          <Flag
            theme={theme}
            label="All-files access"
            ok={diag?.hasAllFilesAccess}
            hint="Required to read recordings outside app-visible folders."
          />
          <Flag theme={theme} label="Model downloaded" ok={diag?.modelDownloaded} />
          <Flag theme={theme} label="On-device engine built" ok={diag?.engineBuilt} />
        </Section>

        {/* ── Latest recording ──────────────────────────────────────── */}
        <Section theme={theme} title="Latest recording">
          {diag?.latestUnprocessedPath ? (
            <>
              <Text style={[styles.mono, { color: theme.onSurface }]} numberOfLines={2}>
                {diag.latestUnprocessedPath}
              </Text>
              <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
                {fmtAge(diag.latestUnprocessedAgeMs)} · unprocessed
              </Text>
            </>
          ) : (
            <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
              No unprocessed recording found right now.
            </Text>
          )}
          {diag?.lastProcessedPath ? (
            <Text style={[styles.sub, { color: theme.onSurfaceVariant }]} numberOfLines={1}>
              Last processed: {diag.lastProcessedPath.split('/').pop()}
            </Text>
          ) : null}
        </Section>

        {/* ── Recent audio files ────────────────────────────────────── */}
        <Section theme={theme} title={`Recent audio files (${diag?.recentRecordings.length ?? 0})`}>
          {diag && diag.recentRecordings.length > 0 ? (
            diag.recentRecordings.map((r) => (
              <View key={r.path} style={styles.fileRow}>
                <Text style={[styles.fileName, { color: theme.onSurface }]} numberOfLines={1}>
                  {r.name}
                </Text>
                <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
                  {fmtAge(r.ageMs)} · {fmtSize(r.sizeBytes)}
                </Text>
              </View>
            ))
          ) : (
            <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
              No audio files visible. Check all-files access or your recorder save folder.
            </Text>
          )}
        </Section>

        {/* ── Folders scanned ───────────────────────────────────────── */}
        <Section theme={theme} title="Folders scanned">
          {diag?.dirs
            .filter((d) => d.exists)
            .map((d) => (
              <View key={d.path} style={styles.fileRow}>
                <Text style={[styles.mono, { color: theme.onSurface }]} numberOfLines={1}>
                  {d.path.replace('/storage/emulated/0', '')}
                </Text>
                <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
                  {d.canRead ? `${d.audioFileCount} audio file(s)` : 'not readable'}
                </Text>
              </View>
            ))}
          {diag && diag.dirs.filter((d) => d.exists).length === 0 && (
            <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
              None of the known recording folders exist or are readable.
            </Text>
          )}
        </Section>

        {/* ── Live log ──────────────────────────────────────────────── */}
        {(running || logs.length > 0) && (
          <View
            style={[styles.logCard, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <View style={styles.logHead}>
              {running ? (
                <ActivityIndicator size="small" color={Colors.primary500} />
              ) : (
                <Ionicons
                  name={testResult?.ok ? 'checkmark-circle' : 'alert-circle'}
                  size={18}
                  color={testResult?.ok ? Colors.success : Colors.urgentFg}
                />
              )}
              <Text style={[styles.logTitle, { color: theme.onSurface }]}>
                {running ? `Running… ${elapsed}s elapsed` : 'Pipeline log'}
              </Text>
            </View>
            {running && (
              <Text style={[styles.runningHint, { color: Colors.primary500 }]}>
                Whisper medium takes 3–10 min on a phone CPU. Keep the screen on and wait.
              </Text>
            )}
            <ScrollView
              ref={logScrollRef}
              style={styles.logScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {logs.length === 0 && (
                <Text style={[styles.logLine, { color: theme.onSurfaceVariant }]}>Starting…</Text>
              )}
              {logs.map((entry, i) => (
                <Text key={i} style={[styles.logLine, { color: theme.onSurface }]}>
                  <Text style={{ color: theme.onSurfaceVariant }}>
                    [{STAGE_LABEL[entry.stage] ?? entry.stage}]{' '}
                  </Text>
                  {entry.message}
                </Text>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Final test result ─────────────────────────────────────── */}
        {testResult && !running && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: theme.surface,
                borderColor: testResult.ok ? Colors.success : Colors.urgentFg,
              },
            ]}
          >
            <View style={styles.cardHead}>
              <Ionicons
                name={testResult.ok ? 'checkmark-circle' : 'alert-circle'}
                size={22}
                color={testResult.ok ? Colors.success : Colors.urgentFg}
              />
              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>
                {testResult.ok
                  ? 'Pipeline succeeded'
                  : `Stopped at: ${STAGE_LABEL[testResult.stage] ?? testResult.stage}`}
              </Text>
            </View>
            {testResult.error && (
              <Text style={[styles.body, { color: theme.onSurface }]}>{testResult.error}</Text>
            )}
            {typeof testResult.decodeMs === 'number' && (
              <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
                Decoded {testResult.decodedSamples?.toLocaleString()} samples in{' '}
                {testResult.decodeMs} ms
              </Text>
            )}
            {typeof testResult.transcribeMs === 'number' && (
              <Text style={[styles.sub, { color: theme.onSurfaceVariant }]}>
                Transcribed in {(testResult.transcribeMs / 1000).toFixed(1)} s
              </Text>
            )}
            {testResult.transcript && (
              <View style={[styles.transcriptBox, { backgroundColor: theme.surfaceVariant }]}>
                <Text style={[styles.body, { color: theme.onSurface }]}>
                  {testResult.transcript}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── Simulate result ───────────────────────────────────────── */}
        {simulateStatus && (
          <View
            style={[
              styles.resultCard,
              {
                backgroundColor: theme.surface,
                borderColor: receivedTranscript ? Colors.success : theme.outline,
              },
            ]}
          >
            <View style={styles.cardHead}>
              {receivedTranscript ? (
                <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
              ) : (
                <ActivityIndicator size="small" color={Colors.primary500} />
              )}
              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{simulateStatus}</Text>
            </View>
            {receivedTranscript && (
              <View style={[styles.transcriptBox, { backgroundColor: theme.surfaceVariant }]}>
                <Text style={[styles.body, { color: theme.onSurface }]}>{receivedTranscript}</Text>
              </View>
            )}
          </View>
        )}

        {/* ── Actions ───────────────────────────────────────────────── */}
        <View style={styles.actions}>
          <Button
            label={running ? `Running… ${elapsed}s` : 'Run full pipeline test'}
            loading={running}
            onPress={() => void runTest()}
            fullWidth
          />
          <Text style={[styles.note, { color: theme.onSurfaceVariant }]}>
            Decodes and transcribes the newest recording on the spot — re-runnable, ignores enabled
            flag and processed marker. Each stage logs in real-time above.
          </Text>

          <Button
            label="Simulate call-ended trigger"
            variant="secondary"
            onPress={() => void simulate()}
            fullWidth
          />
          <Text style={[styles.note, { color: theme.onSurfaceVariant }]}>
            Fires the exact code path a real call-end takes. Transcription runs in the background —
            it will take several minutes. The review screen should appear when done.
          </Text>

          <Pressable onPress={refresh} style={styles.refreshBtn}>
            <Ionicons name="refresh" size={16} color={theme.primary} />
            <Text style={[styles.link, { color: theme.primary }]}>Refresh diagnostics</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Section({
  theme,
  title,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={[styles.section, { backgroundColor: theme.surfaceVariant }]}>
      <Text style={[styles.sectionTitle, { color: theme.onSurface }]}>{title}</Text>
      {children}
    </View>
  );
}

function Flag({
  theme,
  label,
  ok,
  hint,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  ok: boolean | undefined;
  hint?: string;
}): React.JSX.Element {
  const color = ok == null ? theme.onSurfaceVariant : ok ? Colors.success : Colors.urgentFg;
  return (
    <View style={styles.flagWrap}>
      <View style={styles.flagRow}>
        <Ionicons
          name={ok == null ? 'help-circle-outline' : ok ? 'checkmark-circle' : 'close-circle'}
          size={18}
          color={color}
        />
        <Text style={[styles.flagLabel, { color: theme.onSurface }]}>{label}</Text>
      </View>
      {hint && !ok && <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 16, paddingTop: 4 },
  intro: { fontSize: 14, lineHeight: 21 },

  section: { borderRadius: 16, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },

  flagWrap: { gap: 4 },
  flagRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flagLabel: { fontSize: 14, flex: 1 },
  hint: { fontSize: 12, lineHeight: 17, marginLeft: 28 },

  fileRow: { gap: 2 },
  fileName: { fontSize: 13, fontWeight: '600' },
  mono: { fontSize: 12, fontFamily: 'monospace' },
  sub: { fontSize: 12, lineHeight: 17 },

  logCard: { borderRadius: 16, borderWidth: 0.5, padding: 16, gap: 8 },
  logHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  logTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  runningHint: { fontSize: 12, lineHeight: 17, fontWeight: '600' },
  logScroll: { maxHeight: 200 },
  logLine: { fontSize: 12, lineHeight: 19, fontFamily: 'monospace' },

  resultCard: { borderRadius: 16, borderWidth: 1, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', flex: 1 },
  body: { fontSize: 14, lineHeight: 21 },
  transcriptBox: { borderRadius: 12, padding: 12 },

  actions: { gap: 8 },
  note: { fontSize: 12, lineHeight: 17, marginBottom: 8 },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingTop: 8,
  },
  link: { fontSize: 14, fontWeight: '600' },
});
