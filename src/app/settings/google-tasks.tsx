import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { getSetting } from '@/data/storage/settings';
import {
  startOAuthFlow,
  disconnectGoogleTasks,
  handleOAuthCallback,
} from '@/services/google-tasks';

export default function GoogleTasksScreen(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setConnected(getSetting('google_tasks_enabled'));
      setConnecting(false);
    }, [])
  );

  // Listen for the OAuth callback URL. Registered unconditionally (NOT gated on
  // `connecting`): Android may kill the app while the user is in the browser, in
  // which case the redirect cold-starts the app with `connecting` reset to false
  // — the callback must still be handled. getInitialURL covers the cold-start
  // delivery itself; lastHandledUrl dedupes the two paths.
  useEffect(() => {
    let lastHandledUrl = '';
    const processUrl = (url: string): void => {
      if (!url.includes('code=') || url === lastHandledUrl) return;
      lastHandledUrl = url;
      void handleOAuthCallback(url).then((ok) => {
        setConnecting(false);
        if (ok) {
          setConnected(true);
        } else {
          Alert.alert(
            'Connection failed',
            'Could not complete sign-in. Make sure your Client ID and Client Secret are correct and try again.'
          );
        }
      });
    };
    const sub = Linking.addEventListener('url', ({ url }) => processUrl(url));
    void Linking.getInitialURL().then((url) => {
      if (url) processUrl(url);
    });
    return () => sub.remove();
  }, []);

  const handleConnect = async (): Promise<void> => {
    setConnecting(true);
    try {
      await startOAuthFlow();
    } catch (e) {
      setConnecting(false);
      Alert.alert(
        'Could not open sign-in',
        e instanceof Error ? e.message : 'An unexpected error occurred. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const handleDisconnect = (): void => {
    Alert.alert('Disconnect Google Tasks', 'Stop syncing tasks to Google Tasks?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Disconnect',
        style: 'destructive',
        onPress: () => {
          disconnectGoogleTasks();
          setConnected(false);
        },
      },
    ]);
  };

  return (
    <Screen>
      <LargeHeader title="Google Tasks" onBack={() => router.back()} />

      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Status banner */}
        <View
          style={[
            styles.statusBanner,
            {
              backgroundColor: connected ? Colors.successBg : theme.surface,
              borderColor: connected ? Colors.success : theme.outline,
            },
          ]}
        >
          <Text
            style={[
              styles.statusDot,
              { color: connected ? Colors.success : theme.onSurfaceVariant },
            ]}
          >
            {connected ? '● Connected' : '○ Not connected'}
          </Text>
          {connected && (
            <Text style={[styles.statusSub, { color: Colors.success }]}>
              New tasks are automatically synced to your Google Tasks app
            </Text>
          )}
        </View>

        {!connected && (
          <View
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <Text style={[styles.cardTitle, { color: theme.onSurfaceVariant }]}>
              Connect your account
            </Text>
            <Text style={[styles.bodyText, { color: theme.onSurface }]}>
              Sign in with your Google account to start syncing tasks. Make sure{' '}
              <Text style={styles.bold}>rishabh59jain@gmail.com</Text> is set as a Test User in the
              OAuth consent screen.
            </Text>

            <Pressable
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: Colors.primary500 },
                pressed && { opacity: 0.7 },
                connecting && styles.btnDisabled,
              ]}
              onPress={() => void handleConnect()}
              disabled={connecting}
            >
              <Text style={styles.btnText}>
                {connecting ? 'Connecting…' : 'Connect Google Tasks'}
              </Text>
            </Pressable>
          </View>
        )}

        {connected && (
          <View
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <Text style={[styles.cardTitle, { color: theme.onSurfaceVariant }]}>What syncs</Text>
            <Text style={[styles.bodyText, { color: theme.onSurface }]}>
              • Tasks are created in a dedicated “TaskMind” list (created automatically)
            </Text>
            <Text style={[styles.bodyText, { color: theme.onSurface }]}>
              • Full details go into the task notes: priority, sender & source app, how to complete,
              time estimate, deadline time, and message context
            </Text>
            <Text style={[styles.bodyText, { color: theme.onSurface }]}>
              • Due dates are synced so Google Calendar shows reminders
            </Text>
            <Text style={[styles.bodyText, { color: theme.onSurface }]}>
              • Completing a task in TaskMind marks it complete in Google Tasks
            </Text>
            <Text style={[styles.bodyText, { color: theme.onSurface }]}>
              • Deleting or rejecting a task in TaskMind removes it from Google Tasks
            </Text>
          </View>
        )}

        {connected && (
          <Pressable
            style={({ pressed }) => [styles.disconnectBtn, pressed && { opacity: 0.7 }]}
            onPress={handleDisconnect}
          >
            <Text style={styles.disconnectText}>Disconnect Google Tasks</Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  statusBanner: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  statusDot: { fontSize: 14, fontWeight: '600', marginBottom: 4 },
  statusSub: { fontSize: 13, lineHeight: 18 },
  card: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  bold: { fontWeight: '600' },
  btn: {
    height: 52,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: { color: Colors.white, fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
  bodyText: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  disconnectBtn: {
    alignSelf: 'center',
    marginTop: 8,
    padding: 12,
  },
  disconnectText: { fontSize: 14, color: Colors.urgentFg, fontWeight: '600' },
});
