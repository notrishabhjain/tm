import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Alert,
  Switch,
  Pressable,
  TextInput,
} from 'react-native';
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
  apiKeySet: false,
};

export default function InAppTranscriptionScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [status, setStatus] = useState<CallTranscriptionStatus>(DEFAULT_STATUS);
  const [apiKey, setApiKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyMasked, setKeyMasked] = useState(true);

  const refresh = useCallback(() => {
    void NotificationListener.getCallTranscriptionStatus().then(setStatus);
    void NotificationListener.getNvidiaApiKey().then(setApiKey);
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const requestPhonePermissions = async (): Promise<void> => {
    const granted = await NotificationListener.requestCallTranscriptionPermissions();
    refresh();
    if (granted) {
      try {
        await NotificationListener.startService();
      } catch {
        // non-fatal
      }
    } else {
      Alert.alert(
        'Permission needed',
        "Phone & call-log access was not granted. If the dialog didn't appear, you may have denied it before — open App Settings and enable Phone and Call logs manually.",
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

  const saveApiKey = async (): Promise<void> => {
    const trimmed = apiKey.trim();
    if (!trimmed.startsWith('nvapi-')) {
      Alert.alert(
        'Invalid key',
        'NVIDIA API keys start with "nvapi-". Get yours at build.nvidia.com.'
      );
      return;
    }
    setSavingKey(true);
    try {
      await NotificationListener.setNvidiaApiKey(trimmed);
      refresh();
    } finally {
      setSavingKey(false);
    }
  };

  const clearApiKey = async (): Promise<void> => {
    await NotificationListener.setNvidiaApiKey('');
    setApiKey('');
    refresh();
  };

  const toggleEnabled = async (value: boolean): Promise<void> => {
    await NotificationListener.setCallTranscriptionEnabled(value);
    setStatus((s) => ({ ...s, enabled: value }));
  };

  const ready = status.apiKeySet && status.hasPhoneStatePermission && status.hasAllFilesAccess;

  const steps = [
    { ok: status.apiKeySet, label: 'NVIDIA API key saved' },
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
          it via NVIDIA cloud ASR (Whisper Large V3). Fast, accurate, handles Hindi/Hinglish.
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

        {/* Step 1 — API key */}
        <Card theme={theme} step="1" title="Enter NVIDIA API key">
          <Text style={[styles.body, { color: theme.onSurface }]}>
            Get a free key at <Text style={{ color: theme.primary }}>build.nvidia.com</Text> (free
            tier gives 1 000 API calls/month). Keys start with "nvapi-".
          </Text>
          {status.apiKeySet ? (
            <View style={styles.keyRow}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={[styles.body, { color: Colors.success, flex: 1 }]}>API key saved</Text>
              <Pressable onPress={() => void clearApiKey()} style={styles.clearBtn}>
                <Text style={[styles.clearBtnText, { color: Colors.urgentFg }]}>Clear</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.inputRow,
                  { borderColor: theme.outline, backgroundColor: theme.surfaceVariant },
                ]}
              >
                <TextInput
                  style={[styles.input, { color: theme.onSurface }]}
                  placeholder="nvapi-..."
                  placeholderTextColor={theme.onSurfaceVariant}
                  value={apiKey}
                  onChangeText={setApiKey}
                  secureTextEntry={keyMasked}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                <Pressable onPress={() => setKeyMasked((m) => !m)} style={styles.eyeBtn}>
                  <Ionicons
                    name={keyMasked ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={theme.onSurfaceVariant}
                  />
                </Pressable>
              </View>
              <Button
                label={savingKey ? 'Saving…' : 'Save API key'}
                loading={savingKey}
                onPress={() => void saveApiKey()}
                fullWidth
                disabled={!apiKey.trim()}
              />
            </>
          )}
        </Card>

        {/* Step 2 — Permissions */}
        <Card theme={theme} step="2" title="Grant permissions">
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
              Permissions not sticking? Open App Settings
            </Text>
          </Pressable>
        </Card>

        {/* Step 3 — Enable */}
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
          recording, decodes it, and sends the audio to NVIDIA cloud ASR. Whisper Large V3 returns a
          transcript in seconds — the review screen then opens so AI can extract action items.
        </Text>

        <Pressable
          onPress={() => router.push('/settings/transcription-debug')}
          style={[styles.debugBtn, { borderColor: theme.outline }]}
        >
          <Ionicons name="bug-outline" size={18} color={theme.primary} />
          <Text style={[styles.debugLabel, { color: theme.primary }]}>
            Not working? Open debug & test tools
          </Text>
          <Ionicons name="chevron-forward" size={16} color={theme.onSurfaceVariant} />
        </Pressable>
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

  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  clearBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  clearBtnText: { fontSize: 13, fontWeight: '600' },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 14, paddingVertical: 12, fontFamily: 'monospace' },
  eyeBtn: { padding: 6 },

  permLine: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  permLabel: { fontSize: 14, flex: 1 },
  permStatus: { fontSize: 13, fontWeight: '600' },
  linkBtn: { paddingTop: 2 },
  link: { fontSize: 14, fontWeight: '600' },

  enableRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },

  howTitle: {
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    marginTop: 8,
    paddingHorizontal: 4,
  },
  debugBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 0.5,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  debugLabel: { fontSize: 14, fontWeight: '600', flex: 1 },
});
