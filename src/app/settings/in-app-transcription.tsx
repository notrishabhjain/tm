import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, Alert, Switch, Pressable } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';
import { Screen, LargeHeader } from '@/ui/components/Screen';
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

  const requestPhonePermissions = async (): Promise<void> => {
    const granted = await NotificationListener.requestCallTranscriptionPermissions();
    refresh();
    if (granted) {
      // Restart the foreground service so CallStateMonitor can register now
      // that READ_PHONE_STATE is available — the service start triggers the
      // else-branch in onStartCommand which calls CallStateMonitor.start().
      try {
        await NotificationListener.startService();
      } catch {
        // non-fatal
      }
    } else {
      Alert.alert(
        'Permission needed',
        'Phone & call-log access was not granted. If the dialog didn\'t appear, you may have denied it before — open App Settings → Permissions and enable "Phone" and "Call logs" manually.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open App Settings', onPress: () => void NotificationListener.openAppSettings() },
        ]
      );
    }
  };

  const grantAllFiles = async (): Promise<void> => {
    await NotificationListener.openAllFilesAccessSettings();
  };

  const downloadModel = async (): Promise<void> => {
    setDownloading(true);
    setProgress(0);
    try {
      const ok = await NotificationListener.downloadWhisperModel();
      if (!ok) {
        Alert.alert('Download failed', 'Check your connection and try again.');
      }
    } catch {
      Alert.alert('Download failed', 'Check your connection and try again.');
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

  const steps = [
    { ok: status.engineBuilt, label: 'On-device engine (ships in the app)' },
    { ok: status.modelDownloaded, label: `Model downloaded · ${status.modelName}` },
    { ok: status.hasPhoneStatePermission, label: 'Phone & call-log access' },
    { ok: status.hasAllFilesAccess, label: 'All-files access (to read recordings)' },
  ];
  const doneCount = steps.filter((s) => s.ok).length;

  return (
    <Screen>
      <LargeHeader title="Call Transcription" onBack={() => router.back()} />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={[styles.intro, { color: theme.onSurfaceVariant }]}>
          TaskMind detects when a call ends, finds the recording your phone saved, and transcribes
          it on-device — fully inside the app. No Termux, no MacroDroid, no computer needed.
        </Text>

        {/* Progress summary */}
        <View style={[styles.summary, { backgroundColor: theme.surfaceVariant }]}>
          <View style={styles.summaryHead}>
            <Text style={[styles.summaryTitle, { color: theme.onSurface }]}>Setup</Text>
            <Text
              style={[styles.summaryCount, { color: ready ? Colors.success : Colors.primary500 }]}
            >
              {ready ? 'Ready' : `${doneCount} / ${steps.length}`}
            </Text>
          </View>
          {steps.map((s) => (
            <View key={s.label} style={styles.checkRow}>
              <Ionicons
                name={s.ok ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={s.ok ? Colors.success : theme.onSurfaceVariant}
              />
              <Text style={[styles.checkLabel, { color: theme.onSurface }]}>{s.label}</Text>
            </View>
          ))}
        </View>

        {/* Engine note — only if somehow missing from this build */}
        {!status.engineBuilt && (
          <View
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <View style={styles.cardHead}>
              <Ionicons name="information-circle" size={22} color={Colors.primary500} />
              <Text style={[styles.cardTitle, { color: theme.onSurface }]}>
                Engine not detected
              </Text>
            </View>
            <Text style={[styles.body, { color: theme.onSurface }]}>
              The transcription engine is compiled into the app automatically. This build doesn't
              include it — install the latest TaskMind build (the newest APK from your releases) and
              this step will complete on its own. Nothing to do on your phone.
            </Text>
          </View>
        )}

        {/* Permissions */}
        <Card theme={theme} step="1" title="Grant permissions">
          <PermLine
            theme={theme}
            label="Phone & call log"
            granted={status.hasPhoneStatePermission}
          />
          <PermLine theme={theme} label="All files access" granted={status.hasAllFilesAccess} />
          <Text style={[styles.note, { color: theme.onSurfaceVariant }]}>
            Call-recorder apps usually save outside the folders Android shares by default, so
            all-files access is required to read them.
          </Text>
          {!status.hasPhoneStatePermission && (
            <Button
              label="Grant phone & call-log access"
              onPress={() => void requestPhonePermissions()}
              fullWidth
            />
          )}
          {!status.hasAllFilesAccess && (
            <Button
              label="Grant all-files access"
              variant="secondary"
              onPress={() => void grantAllFiles()}
              fullWidth
            />
          )}
          <Pressable
            onPress={() => void NotificationListener.openAppSettings()}
            style={styles.linkBtn}
          >
            <Text style={[styles.link, { color: theme.primary }]}>
              Permissions not sticking? Open App Settings ›
            </Text>
          </Pressable>
        </Card>

        {/* Model */}
        <Card theme={theme} step="2" title="Download the model">
          <Text style={[styles.body, { color: theme.onSurface }]}>
            medium-q5_0 (~530 MB) gives much better accuracy on Hindi/Hinglish and accented speech
            than the small model. Downloaded once, over Wi-Fi, and stored on your device.
          </Text>
          {status.modelDownloaded ? (
            <Button
              label="Delete model"
              variant="destructive"
              onPress={() => void deleteModel()}
              fullWidth
            />
          ) : (
            <>
              <Button
                label={downloading ? `Downloading… ${progress}%` : 'Download model (~530 MB)'}
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
        </Card>

        {/* Enable */}
        <Card theme={theme} step="3" title="Enable">
          <View style={styles.enableRow}>
            <Text style={[styles.body, styles.flex1, { color: theme.onSurface }]}>
              Auto-transcribe and review tasks after every call
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
            <Text style={[styles.note, { color: theme.onSurfaceVariant }]}>
              Finish the steps above to enable this.
            </Text>
          )}
        </Card>

        <Text style={[styles.howTitle, { color: theme.onSurfaceVariant }]}>HOW IT WORKS</Text>
        <Text style={[styles.body, { color: theme.onSurfaceVariant, paddingHorizontal: 4 }]}>
          When a call ends, TaskMind waits ~15s for your recorder to save the file, finds the newest
          recording, and transcribes it on-device — audio never leaves your phone. The transcript
          opens the review screen where AI extracts action items with correct dates.
        </Text>
      </ScrollView>
    </Screen>
  );
}

function Card({
  theme,
  step,
  title,
  children,
}: {
  theme: ReturnType<typeof useTheme>;
  step: string;
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <View style={styles.cardHead}>
        <View style={styles.stepBadge}>
          <Text style={styles.stepBadgeText}>{step}</Text>
        </View>
        <Text style={[styles.cardTitle, { color: theme.onSurface }]}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function PermLine({
  theme,
  label,
  granted,
}: {
  theme: ReturnType<typeof useTheme>;
  label: string;
  granted: boolean;
}): React.JSX.Element {
  return (
    <View style={styles.permLine}>
      <Ionicons
        name={granted ? 'checkmark-circle' : 'close-circle-outline'}
        size={18}
        color={granted ? Colors.success : Colors.urgentFg}
      />
      <Text style={[styles.permLabel, { color: theme.onSurface }]}>{label}</Text>
      <Text style={[styles.permStatus, { color: granted ? Colors.success : Colors.urgentFg }]}>
        {granted ? 'Granted' : 'Needed'}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingBottom: 48, gap: 16, paddingTop: 4 },
  intro: { fontSize: 15, lineHeight: 23 },

  summary: { borderRadius: 16, padding: 16, gap: 12 },
  summaryHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  summaryTitle: { fontSize: 16, fontWeight: '700' },
  summaryCount: { fontSize: 15, fontWeight: '700' },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkLabel: { fontSize: 14, flex: 1 },

  card: { borderRadius: 16, borderWidth: 0.5, padding: 16, gap: 12 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: Colors.primary500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepBadgeText: { color: Colors.white, fontSize: 13, fontWeight: '700' },
  cardTitle: { fontSize: 17, fontWeight: '700', letterSpacing: -0.2 },

  body: { fontSize: 14, lineHeight: 22 },
  note: { fontSize: 13, lineHeight: 19 },
  flex1: { flex: 1 },

  permLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  permLabel: { fontSize: 14, flex: 1 },
  permStatus: { fontSize: 13, fontWeight: '600' },
  linkBtn: { paddingTop: 2 },
  link: { fontSize: 14, fontWeight: '600' },

  enableRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: 6, backgroundColor: Colors.primary500 },

  howTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 8,
    paddingHorizontal: 4,
  },
});
