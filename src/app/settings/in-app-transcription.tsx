import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Switch } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import NotificationListener from '../../../modules/notification-listener/src';
import type { CallTranscriptionStatus } from '../../../modules/notification-listener/src';

const DEFAULT_STATUS: CallTranscriptionStatus = {
  enabled: false,
  hasPhoneStatePermission: false,
  hasCallLogPermission: false,
  hasAllFilesAccess: false,
  modelDownloaded: false,
  engineBuilt: false,
  modelName: 'ggml-medium-q5_0.bin',
};

function CheckRow({
  label,
  ok,
  theme,
}: {
  label: string;
  ok: boolean;
  theme: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  return (
    <View style={styles.checkRow}>
      <Text style={[styles.checkMark, { color: ok ? Colors.success : theme.onSurfaceVariant }]}>
        {ok ? '✓' : '○'}
      </Text>
      <Text style={[styles.checkLabel, { color: theme.onSurface }]}>{label}</Text>
    </View>
  );
}

function Section({
  title,
  children,
  theme,
}: {
  title: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <Text style={[styles.sectionTitle, { color: theme.primary }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function InAppTranscriptionScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<CallTranscriptionStatus>(DEFAULT_STATUS);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(0);

  const refresh = useCallback(() => {
    void NotificationListener.getCallTranscriptionStatus().then(setStatus);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  React.useEffect(() => {
    const sub = NotificationListener.addModelDownloadProgressListener(({ progress: p }) => {
      setProgress(p);
    });
    return () => sub.remove();
  }, []);

  const requestPermissions = async (): Promise<void> => {
    await NotificationListener.requestCallTranscriptionPermissions();
    refresh();
  };

  const openAllFilesAccess = async (): Promise<void> => {
    await NotificationListener.openAllFilesAccessSettings();
  };

  const downloadModel = async (): Promise<void> => {
    setDownloading(true);
    setProgress(0);
    try {
      const ok = await NotificationListener.downloadWhisperModel();
      if (!ok) {
        Alert.alert(
          'Download failed',
          'Could not download the transcription model. Check your connection and try again.'
        );
      }
    } catch {
      Alert.alert(
        'Download failed',
        'Could not download the transcription model. Check your connection and try again.'
      );
    } finally {
      setDownloading(false);
      refresh();
    }
  };

  const deleteModel = async (): Promise<void> => {
    await NotificationListener.deleteWhisperModel();
    refresh();
  };

  const toggleEnabled = async (value: boolean): Promise<void> => {
    await NotificationListener.setCallTranscriptionEnabled(value);
    setStatus((s) => ({ ...s, enabled: value }));
  };

  const ready =
    status.engineBuilt &&
    status.modelDownloaded &&
    status.hasPhoneStatePermission &&
    status.hasAllFilesAccess;

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Text style={[styles.back, { color: theme.primary }]}>‹ Settings</Text>
      </Pressable>

      <Text style={[styles.title, { color: theme.onSurface }]}>In-App Call Transcription</Text>
      <Text style={[styles.intro, { color: theme.onSurfaceVariant }]}>
        TaskMind can detect when a call ends, find the recording your phone's built-in recorder
        saved, and transcribe it on-device with whisper.cpp — entirely inside the app. No Termux, no
        MacroDroid, nothing that Android can kill in the background.
      </Text>

      <Section title="Status" theme={theme}>
        <CheckRow
          label="Native transcription engine built into this app"
          ok={status.engineBuilt}
          theme={theme}
        />
        <CheckRow
          label={`Model downloaded (${status.modelName}, ~530 MB)`}
          ok={status.modelDownloaded}
          theme={theme}
        />
        <CheckRow
          label="Phone & call log access"
          ok={status.hasPhoneStatePermission}
          theme={theme}
        />
        <CheckRow
          label="All files access (to read recordings)"
          ok={status.hasAllFilesAccess}
          theme={theme}
        />
      </Section>

      {!status.engineBuilt && (
        <Section title="1 — Build the native engine" theme={theme}>
          <Text style={[styles.body, { color: theme.onSurface }]}>
            This requires a one-time rebuild of the Android app with whisper.cpp's source checked
            out. From the project root:
          </Text>
          <View style={[styles.codeBox, { backgroundColor: '#0A2540' }]}>
            <Text style={styles.code}>
              {'cd modules/notification-listener/android/src/main/cpp\n'}
              {'git clone --depth 1 https://github.com/ggerganov/whisper.cpp\n'}
              {'cd ../../../../../..\n'}
              {'npx expo run:android --variant release'}
            </Text>
          </View>
          <Text style={[styles.body, { color: theme.onSurface }]}>
            After this one-time build, every future build of the app includes the on-device
            transcription engine automatically.
          </Text>
        </Section>
      )}

      <Section title="2 — Permissions" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          TaskMind needs to know when a call ends (Phone & call log access) and where your phone's
          call-recorder app saves files (All files access — most call-recording apps save outside
          the folders Android shares by default).
        </Text>
        <Button
          variant="secondary"
          label="Grant Phone & Call Log Access"
          onPress={() => void requestPermissions()}
          fullWidth
        />
        <Button
          variant="secondary"
          label="Grant All Files Access"
          onPress={() => void openAllFilesAccess()}
          fullWidth
        />
      </Section>

      <Section title="3 — Transcription model" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          medium-q5_0 gives noticeably better accuracy than the small model on Hindi/Hinglish and
          accented speech — at roughly 2-3x the transcription time. Downloaded once, stored on your
          device.
        </Text>
        {status.modelDownloaded ? (
          <Button
            variant="destructive"
            label="Delete Model"
            onPress={() => void deleteModel()}
            fullWidth
          />
        ) : (
          <>
            <Button
              variant="primary"
              label={downloading ? `Downloading… ${progress}%` : 'Download Model (~530 MB)'}
              loading={downloading}
              onPress={() => void downloadModel()}
              fullWidth
            />
            {downloading && (
              <View style={[styles.progressTrack, { backgroundColor: theme.outline }]}>
                <View style={[styles.progressFill, { width: `${progress}%` }]} />
              </View>
            )}
          </>
        )}
      </Section>

      <Section title="4 — Enable" theme={theme}>
        <View style={styles.enableRow}>
          <Text style={[styles.body, styles.flex1, { color: theme.onSurface }]}>
            Automatically transcribe and review tasks after every call
          </Text>
          <Switch
            value={status.enabled}
            onValueChange={(v) => void toggleEnabled(v)}
            disabled={!ready}
            trackColor={{ true: Colors.primary500, false: theme.outline }}
            thumbColor={Colors.white}
          />
        </View>
        {!ready && (
          <Text style={[styles.body, { color: theme.onSurfaceVariant }]}>
            Complete the steps above to enable this.
          </Text>
        )}
      </Section>

      <Section title="How it works" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}When a call ends, TaskMind waits 15s for your recorder app to finish saving the
          file, then finds the newest recording automatically.
          {'\n\n'}
          {'• '}The recording is decoded and transcribed on-device — audio never leaves your phone.
          {'\n\n'}
          {'• '}The transcript opens the same review screen as before, where AI extracts action
          items with correct dates (uses the Cloud AI configured in Settings → Intelligence).
          {'\n\n'}
          {'• '}If your phone saves recordings somewhere unusual, browse to the folder with a file
          manager — TaskMind checks the common locations automatically, but you can also look at the
          Call Transcription (legacy) screen for the exact paths checked.
        </Text>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  backRow: { marginBottom: 4 },
  back: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  intro: { fontSize: 14, lineHeight: 22 },
  section: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  body: { fontSize: 14, lineHeight: 22 },
  flex1: { flex: 1 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkMark: { fontSize: 16, fontWeight: '800', width: 20 },
  checkLabel: { fontSize: 14, flex: 1 },
  codeBox: { borderRadius: 2, padding: 12 },
  code: { fontFamily: 'monospace', fontSize: 12, color: '#E2E8F0', lineHeight: 20 },
  enableRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: Colors.primary500 },
});
