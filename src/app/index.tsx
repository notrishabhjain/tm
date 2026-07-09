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

interface PipelineStatus {
  notifAccess: boolean;
  serviceRunning: boolean;
  callEnabled: boolean;
  phonePerms: boolean;
  filesAccess: boolean;
  googleConnected: boolean;
}

const DEFAULT_STATUS: PipelineStatus = {
  notifAccess: false,
  serviceRunning: false,
  callEnabled: false,
  phonePerms: false,
  filesAccess: false,
  googleConnected: false,
};

export default function StatusScreen(): React.JSX.Element {
  const theme = useTheme();
  const [status, setStatus] = useState<PipelineStatus>(DEFAULT_STATUS);

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
