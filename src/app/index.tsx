import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Switch,
  Pressable,
  Alert,
  Linking,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { getSetting } from '@/data/storage/settings';
import { getRecentActivity } from '@/data/pipeline-store';
import type { ActivityEntry } from '@/data/pipeline-store';
import {
  startOAuthFlow,
  handleOAuthCallback,
  disconnectGoogleTasks,
} from '@/services/google-tasks';
import { appDisplayName } from '@/services/app-name-map';
import NotificationListener from '../../modules/notification-listener/src';
import type { OemInfo } from '../../modules/notification-listener/src/types';

interface PipelineStatus {
  notifAccess: boolean;
  serviceRunning: boolean;
  callEnabled: boolean;
  phonePerms: boolean;
  filesAccess: boolean;
  googleConnected: boolean;
  sarvamKeySet: boolean;
}

const DEFAULT_STATUS: PipelineStatus = {
  notifAccess: false,
  serviceRunning: false,
  callEnabled: false,
  phonePerms: false,
  filesAccess: false,
  googleConnected: false,
  sarvamKeySet: false,
};

export default function StatusScreen(): React.JSX.Element {
  const theme = useTheme();
  const [status, setStatus] = useState<PipelineStatus>(DEFAULT_STATUS);
  const [oem, setOem] = useState<OemInfo | null>(null);
  const [testing, setTesting] = useState(false);
  const [testLogs, setTestLogs] = useState<string[]>([]);
  const [editingSarvamKey, setEditingSarvamKey] = useState(false);
  const [sarvamKeyDraft, setSarvamKeyDraft] = useState('');

  useEffect(() => {
    void NotificationListener.getOemInfo()
      .then(setOem)
      .catch(() => {});
    const sub = NotificationListener.addCallTranscriptionTestLogListener((e) => {
      setTestLogs((prev) => [...prev, `[${e.stage}] ${e.message}`].slice(-40));
    });
    return () => sub.remove();
  }, []);

  const refresh = useCallback(() => {
    void (async () => {
      try {
        const [perm, running, call] = await Promise.all([
          NotificationListener.getPermissionStatus(),
          NotificationListener.isServiceRunning(),
          NotificationListener.getCallTranscriptionStatus(),
        ]);
        setStatus({
          notifAccess: perm === 'granted',
          serviceRunning: running,
          callEnabled: call.enabled,
          phonePerms: call.hasPhoneStatePermission && call.hasCallLogPermission,
          filesAccess: call.hasAllFilesAccess,
          googleConnected: getSetting('google_tasks_enabled'),
          sarvamKeySet: call.sarvamKeySet,
        });
        if (perm === 'granted' && !running) {
          void NotificationListener.startService().catch(() => {});
        }
      } catch {
        /* native unavailable (dev) */
      }
    })();
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const saveSarvamKey = async (): Promise<void> => {
    await NotificationListener.setSarvamApiKey(sarvamKeyDraft.trim()).catch(() => {});
    setEditingSarvamKey(false);
    setSarvamKeyDraft('');
    refresh();
  };

  // OAuth callback listener — Google redirects back into the app.
  useEffect(() => {
    let lastHandled = '';
    const processUrl = (url: string): void => {
      if (!url.includes('code=') || url === lastHandled) return;
      lastHandled = url;
      void handleOAuthCallback(url).then((ok) => {
        refresh();
        if (!ok) Alert.alert('Google connection failed', 'Please try connecting again.');
      });
    };
    const sub = Linking.addEventListener('url', ({ url }) => processUrl(url));
    void Linking.getInitialURL().then((url) => {
      if (url) processUrl(url);
    });
    return () => sub.remove();
  }, [refresh]);

  const {
    data: activity = [],
    refetch,
    isRefetching,
  } = useQuery({
    queryKey: ['activity'],
    queryFn: () => getRecentActivity(100),
    refetchInterval: 7000,
  });

  const toggleCalls = async (value: boolean): Promise<void> => {
    if (value && !status.phonePerms) {
      const granted = await NotificationListener.requestCallTranscriptionPermissions();
      if (!granted) {
        Alert.alert('Permission needed', 'Phone & call-log access is required for call analysis.');
        refresh();
        return;
      }
    }
    if (value && !status.filesAccess) {
      Alert.alert(
        'One more step',
        'Allow "All files access" so TaskMind can read your call recordings.',
        [
          { text: 'Later', style: 'cancel' },
          {
            text: 'Open settings',
            onPress: () => void NotificationListener.openAllFilesAccessSettings(),
          },
        ]
      );
    }
    await NotificationListener.setCallTranscriptionEnabled(value);
    refresh();
  };

  const handleGoogle = (): void => {
    if (status.googleConnected) {
      Alert.alert('Disconnect Google Tasks?', 'Tasks will stop syncing.', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Disconnect',
          style: 'destructive',
          onPress: () => {
            disconnectGoogleTasks();
            refresh();
          },
        },
      ]);
    } else {
      void startOAuthFlow().catch((e) =>
        Alert.alert('Could not open sign-in', e instanceof Error ? e.message : 'Try again.')
      );
    }
  };

  const runPipelineTest = async (): Promise<void> => {
    if (testing) return;
    setTesting(true);
    setTestLogs(['Running full call-pipeline test (find → decode → cloud transcription)…']);
    try {
      const res = await NotificationListener.runCallTranscriptionTest();
      setTestLogs((prev) => [
        ...prev,
        res.ok
          ? '✓ PASS — the call pipeline works end-to-end on this device'
          : `✗ FAIL at "${res.stage}": ${res.error ?? 'unknown error'}`,
      ]);
    } catch (e) {
      setTestLogs((prev) => [...prev, `✗ FAIL: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      setTesting(false);
    }
  };

  const checkNow = (): void => {
    setTestLogs([
      'Checking now — scanning recordings from the last 24h, the notification tray, and the sync queue. Results appear in Recent Activity below.',
    ]);
    void NotificationListener.scanForMissedCalls().catch(() => {});
    void NotificationListener.drainPendingNotifications().catch(() => {});
    void NotificationListener.scanActiveNotifications().catch(() => {});
    setTimeout(() => void refetch(), 5000);
  };

  const allGood =
    status.notifAccess && status.callEnabled && status.phonePerms && status.googleConnected;

  return (
    <Screen>
      <LargeHeader
        title="TaskMind"
        subtitle={allGood ? 'Pipeline active — tasks flow to Google Tasks' : 'Finish setup below'}
      />

      <FlatList
        data={activity}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => void refetch()} />
        }
        ListHeaderComponent={
          <View style={styles.setup}>
            <SetupRow
              ok={status.notifAccess}
              label="Notification access"
              detail="Reads messages from your messaging apps"
              actionLabel={status.notifAccess ? undefined : 'Grant'}
              onAction={() => void NotificationListener.openPermissionSettings()}
            />
            <View
              style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.outline }]}
            >
              <StatusDot ok={status.callEnabled && status.phonePerms && status.filesAccess} />
              <View style={styles.rowText}>
                <Text style={[styles.rowLabel, { color: theme.onSurface }]}>Call analysis</Text>
                <Text style={[styles.rowDetail, { color: theme.onSurfaceVariant }]}>
                  {status.filesAccess
                    ? 'Transcribes call recordings after every call'
                    : 'Needs "All files access" to read recordings'}
                </Text>
              </View>
              <Switch
                value={status.callEnabled}
                onValueChange={(v) => void toggleCalls(v)}
                trackColor={{ true: Colors.primary500, false: theme.outline }}
              />
            </View>
            <View style={styles.sarvamBlock}>
              <SetupRow
                ok={status.sarvamKeySet}
                label="Hindi transcription (Sarvam AI)"
                detail={
                  status.sarvamKeySet
                    ? 'Active — calls are transcribed by the Hindi/Hinglish specialist engine'
                    : 'Add a free Sarvam AI key for far more accurate Hindi call transcription (dashboard.sarvam.ai)'
                }
                actionLabel={
                  editingSarvamKey ? undefined : status.sarvamKeySet ? 'Change' : 'Add key'
                }
                onAction={() => setEditingSarvamKey(true)}
              />
              {editingSarvamKey && (
                <View
                  style={[
                    styles.row,
                    { backgroundColor: theme.surface, borderColor: theme.outline },
                  ]}
                >
                  <TextInput
                    value={sarvamKeyDraft}
                    onChangeText={setSarvamKeyDraft}
                    placeholder="Paste Sarvam API key (blank = use Whisper)"
                    placeholderTextColor={theme.onSurfaceVariant}
                    autoCapitalize="none"
                    autoCorrect={false}
                    style={[styles.keyInput, { color: theme.onSurface }]}
                  />
                  <Pressable
                    onPress={() => void saveSarvamKey()}
                    style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                  >
                    <Text style={styles.actionText}>Save</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setEditingSarvamKey(false);
                      setSarvamKeyDraft('');
                    }}
                  >
                    <Text style={[styles.logDismissText, { color: theme.onSurfaceVariant }]}>
                      Cancel
                    </Text>
                  </Pressable>
                </View>
              )}
            </View>
            <SetupRow
              ok={status.googleConnected}
              label="Google Tasks"
              detail={
                status.googleConnected
                  ? 'Connected — tasks land in your "TaskMind" list'
                  : 'Sign in so tasks can be created'
              }
              actionLabel={status.googleConnected ? 'Disconnect' : 'Connect'}
              onAction={handleGoogle}
            />

            {oem?.needsAutostart && (
              <View
                style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.outline }]}
              >
                <Ionicons name="flash-outline" size={18} color={Colors.primary500} />
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, { color: theme.onSurface }]}>
                    Autostart ({oem.manufacturer})
                  </Text>
                  <Text style={[styles.rowDetail, { color: theme.onSurfaceVariant }]}>
                    {oem.oem === 'xiaomi'
                      ? 'On Xiaomi/Redmi, enable Autostart for TaskMind — without it, HyperOS blocks call detection in the background even with battery unrestricted.'
                      : 'Enable Autostart for TaskMind so background call detection is not killed by the battery manager.'}
                  </Text>
                </View>
                <Pressable
                  onPress={() => void NotificationListener.openAutostartSettings()}
                  style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
                >
                  <Text style={styles.actionText}>Open</Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.activityTitle, { color: theme.onSurfaceVariant }]}>
              TROUBLESHOOT
            </Text>
            <View style={styles.troubleshootRow}>
              <Pressable
                onPress={() => void runPipelineTest()}
                disabled={testing}
                style={({ pressed }) => [
                  styles.troubleshootBtn,
                  { borderColor: theme.outline, backgroundColor: theme.surface },
                  (pressed || testing) && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="pulse-outline" size={16} color={Colors.primary500} />
                <Text style={[styles.troubleshootText, { color: theme.onSurface }]}>
                  {testing ? 'Testing…' : 'Test call pipeline'}
                </Text>
              </Pressable>
              <Pressable
                onPress={checkNow}
                style={({ pressed }) => [
                  styles.troubleshootBtn,
                  { borderColor: theme.outline, backgroundColor: theme.surface },
                  pressed && { opacity: 0.6 },
                ]}
              >
                <Ionicons name="refresh-outline" size={16} color={Colors.primary500} />
                <Text style={[styles.troubleshootText, { color: theme.onSurface }]}>Check now</Text>
              </Pressable>
            </View>
            {testLogs.length > 0 && (
              <View style={[styles.logBox, { borderColor: theme.outline }]}>
                {testLogs.map((line, i) => (
                  <Text key={i} style={styles.logLine}>
                    {line}
                  </Text>
                ))}
                <Pressable onPress={() => setTestLogs([])} style={styles.logDismiss}>
                  <Text style={[styles.logDismissText, { color: theme.onSurfaceVariant }]}>
                    Dismiss
                  </Text>
                </Pressable>
              </View>
            )}

            <Text style={[styles.activityTitle, { color: theme.onSurfaceVariant }]}>
              RECENT ACTIVITY
            </Text>
            {activity.length === 0 && (
              <Text style={[styles.empty, { color: theme.onSurfaceVariant }]}>
                Nothing yet — incoming messages and calls will appear here.
              </Text>
            )}
          </View>
        }
        renderItem={({ item }) => <ActivityRow entry={item} />}
      />
    </Screen>
  );
}

function StatusDot({ ok }: { ok: boolean }): React.JSX.Element {
  return <View style={[styles.dot, { backgroundColor: ok ? Colors.success : Colors.urgentFg }]} />;
}

function SetupRow({
  ok,
  label,
  detail,
  actionLabel,
  onAction,
}: {
  ok: boolean;
  label: string;
  detail: string;
  actionLabel?: string;
  onAction?: () => void;
}): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={[styles.row, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <StatusDot ok={ok} />
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: theme.onSurface }]}>{label}</Text>
        <Text style={[styles.rowDetail, { color: theme.onSurfaceVariant }]}>{detail}</Text>
      </View>
      {actionLabel && onAction && (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [styles.actionBtn, pressed && { opacity: 0.7 }]}
        >
          <Text style={styles.actionText}>{actionLabel}</Text>
        </Pressable>
      )}
    </View>
  );
}

function ActivityRow({ entry }: { entry: ActivityEntry }): React.JSX.Element {
  const theme = useTheme();
  const icon =
    entry.outcome === 'TASK_CREATED'
      ? 'checkmark-circle'
      : entry.outcome === 'QUEUED'
        ? 'cloud-upload-outline'
        : entry.outcome === 'ERROR'
          ? 'alert-circle-outline'
          : 'remove-circle-outline';
  const color =
    entry.outcome === 'TASK_CREATED'
      ? Colors.success
      : entry.outcome === 'ERROR'
        ? Colors.urgentFg
        : theme.onSurfaceVariant;
  const sourceLabel = entry.source === 'call' ? 'Call' : appDisplayName(entry.source);
  const time = new Date(entry.createdAt).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return (
    <View style={[styles.activityRow, { borderBottomColor: theme.outline }]}>
      <Ionicons name={icon} size={18} color={color} style={styles.activityIcon} />
      <View style={styles.rowText}>
        <Text style={[styles.activityHead, { color: theme.onSurface }]} numberOfLines={1}>
          {entry.label} · {sourceLabel} · {time}
        </Text>
        <Text style={[styles.activityDetail, { color: theme.onSurfaceVariant }]} numberOfLines={2}>
          {entry.detail}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 32 },
  setup: { gap: 10, paddingTop: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 0.5,
    borderRadius: 14,
    padding: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowDetail: { fontSize: 12, marginTop: 2, lineHeight: 17 },
  actionBtn: {
    backgroundColor: Colors.primary500,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  actionText: { color: Colors.white, fontSize: 13, fontWeight: '600' },
  activityTitle: { fontSize: 12, fontWeight: '700', marginTop: 18, marginBottom: 4 },
  sarvamBlock: { gap: 10 },
  keyInput: { flex: 1, fontSize: 13, padding: 0 },
  troubleshootRow: { flexDirection: 'row', gap: 10 },
  troubleshootBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 0.5,
    borderRadius: 12,
    paddingVertical: 11,
  },
  troubleshootText: { fontSize: 13, fontWeight: '600' },
  logBox: {
    borderWidth: 0.5,
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
    backgroundColor: 'rgba(127,127,127,0.08)',
  },
  logLine: { fontSize: 11, fontFamily: 'monospace', lineHeight: 16, color: '#7A9E7E' },
  logDismiss: { alignSelf: 'flex-end', paddingTop: 6 },
  logDismissText: { fontSize: 12, fontWeight: '600' },
  empty: { fontSize: 13, paddingVertical: 12 },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  activityIcon: { marginTop: 2 },
  activityHead: { fontSize: 13, fontWeight: '600' },
  activityDetail: { fontSize: 12, lineHeight: 17, marginTop: 1 },
});
