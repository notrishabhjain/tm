import React, { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking, Alert } from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';
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

  // Listen for the OAuth callback URL while the flow is in progress.
  // The redirect uses the reversed-client-ID scheme (e.g. com.googleusercontent.apps.xxx:/)
  // which Android delivers via onNewIntent → Linking event without navigating Expo Router.
  useEffect(() => {
    if (!connecting) return;
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (!url.includes('code=')) return;
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
    });
    return () => sub.remove();
  }, [connecting]);

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
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Text style={[styles.back, { color: theme.primary }]}>‹ Settings</Text>
      </Pressable>

      <Text style={[styles.title, { color: theme.onSurface }]}>Google Tasks</Text>

      {/* Status banner */}
      <View
        style={[
          styles.statusBanner,
          {
            backgroundColor: connected ? '#0D3321' : theme.surface,
            borderColor: connected ? Colors.success : theme.outline,
          },
        ]}
      >
        <Text
          style={[styles.statusDot, { color: connected ? Colors.success : theme.onSurfaceVariant }]}
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
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <Text style={[styles.cardTitle, { color: theme.primary }]}>Connect your account</Text>
          <Text style={[styles.bodyText, { color: theme.onSurface }]}>
            Sign in with your Google account to start syncing tasks. Make sure{' '}
            <Text style={styles.bold}>rishabh59jain@gmail.com</Text> is set as a Test User in the
            OAuth consent screen.
          </Text>

          <View style={styles.btnWrapper}>
            <View style={[styles.btnShadow, { backgroundColor: Colors.black }]} />
            <Pressable
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: Colors.primary900, borderColor: Colors.black },
                pressed && { transform: [{ translateX: 3 }, { translateY: 3 }] },
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
        </View>
      )}

      {connected && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <Text style={[styles.cardTitle, { color: theme.primary }]}>What syncs</Text>
          <Text style={[styles.bodyText, { color: theme.onSurface }]}>
            • Every new task captured from a notification is automatically created in Google Tasks
          </Text>
          <Text style={[styles.bodyText, { color: theme.onSurface }]}>
            • AI-extracted details (how to complete, time estimate) are added to the task notes
          </Text>
          <Text style={[styles.bodyText, { color: theme.onSurface }]}>
            • Due dates are synced so Google Calendar shows reminders
          </Text>
          <Text style={[styles.bodyText, { color: theme.onSurface }]}>
            • Completing a task in TaskMind marks it complete in Google Tasks too
          </Text>
        </View>
      )}

      {connected && (
        <Pressable style={styles.disconnectBtn} onPress={handleDisconnect}>
          <Text style={styles.disconnectText}>Disconnect Google Tasks</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48 },
  backRow: { marginBottom: 8 },
  back: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', marginBottom: 20, letterSpacing: -0.3 },
  statusBanner: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 14,
    marginBottom: 20,
  },
  statusDot: { fontSize: 14, fontWeight: '700', marginBottom: 4 },
  statusSub: { fontSize: 13, lineHeight: 18 },
  card: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 16,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  bold: { fontWeight: '700' },
  btnWrapper: { position: 'relative', paddingRight: 3, paddingBottom: 3 },
  btnShadow: {
    position: 'absolute',
    top: 3,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  btn: {
    height: 48,
    borderWidth: 2,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: Colors.white, fontSize: 14, fontWeight: '700', letterSpacing: 0.3 },
  bodyText: { fontSize: 14, lineHeight: 22, marginBottom: 8 },
  disconnectBtn: {
    alignSelf: 'center',
    marginTop: 8,
    padding: 12,
  },
  disconnectText: { fontSize: 14, color: Colors.urgentFg, fontWeight: '600' },
});
