import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  StyleSheet,
  Linking,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';
import { getSetting } from '@/data/storage/settings';
import { startOAuthFlow, disconnectGoogleTasks } from '@/services/google-tasks';

export default function GoogleTasksScreen(): React.JSX.Element {
  const router = useRouter();
  const theme = useTheme();
  const [connected, setConnected] = useState(false);
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [connecting, setConnecting] = useState(false);

  useFocusEffect(
    useCallback(() => {
      // Refresh on every focus — picks up the connected state after OAuth returns
      setConnected(getSetting('google_tasks_enabled'));
      setConnecting(false);
      const saved = getSetting('google_tasks_client_id');
      if (saved) setClientId(saved);
      const savedSecret = getSetting('google_tasks_client_secret');
      if (savedSecret) setClientSecret(savedSecret);
    }, [])
  );

  const handleConnect = async (): Promise<void> => {
    // Strip any accidentally-pasted URL prefix — only the raw client ID is needed
    const trimmed = clientId.trim().replace(/^https?:\/\//i, '');
    if (!trimmed) {
      Alert.alert('Client ID required', 'Paste your Google OAuth Client ID before connecting.');
      return;
    }
    const trimmedSecret = clientSecret.trim();
    if (!trimmedSecret) {
      Alert.alert(
        'Client Secret required',
        'Paste your Google OAuth Client Secret before connecting. You can find it in Google Cloud Console → Credentials → click on your Desktop app credential.'
      );
      return;
    }
    setConnecting(true);
    // Stay in "connecting" state while Chrome is open — useFocusEffect resets it on return
    try {
      await startOAuthFlow(trimmed, trimmedSecret);
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

  const openConsole = (): void => {
    void Linking.openURL('https://console.cloud.google.com/');
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
          <Text style={[styles.cardTitle, { color: theme.primary }]}>Setup (one-time)</Text>

          <Text style={[styles.step, { color: theme.onSurface }]}>
            1. Open Google Cloud Console and create a project
          </Text>
          <Text style={[styles.step, { color: theme.onSurface }]}>
            2. Enable the <Text style={styles.bold}>Google Tasks API</Text>
          </Text>
          <Text style={[styles.step, { color: theme.onSurface }]}>
            3. Configure the <Text style={styles.bold}>OAuth consent screen</Text> → add your Google
            account as a Test User
          </Text>
          <Text style={[styles.step, { color: theme.onSurface }]}>
            4. Go to Credentials → Create Credentials → OAuth 2.0 Client ID
          </Text>
          <Text style={[styles.step, { color: theme.onSurface }]}>
            5. Choose <Text style={styles.bold}>Desktop app</Text> type
          </Text>
          <Text style={[styles.step, { color: theme.onSurface }]}>
            6. Under "Authorized redirect URIs" add exactly:
          </Text>
          <View style={[styles.codeBox, { backgroundColor: '#0A2540' }]}>
            <Text style={styles.codeText}>taskmind://oauth/google</Text>
          </View>
          <Text style={[styles.step, { color: theme.onSurface }]}>
            7. Click <Text style={styles.bold}>Create</Text> — Google shows your Client ID{' '}
            <Text style={styles.italic}>(ends with .apps.googleusercontent.com)</Text> and Client
            Secret <Text style={styles.italic}>(starts with GOCSPX-)</Text>. Copy both and paste
            below.
          </Text>

          <Pressable style={styles.consoleBtn} onPress={openConsole}>
            <Text style={styles.consoleBtnText}>Open Google Cloud Console ↗</Text>
          </Pressable>
        </View>
      )}

      {!connected && (
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <Text style={[styles.cardTitle, { color: theme.primary }]}>OAuth Credentials</Text>
          <Text style={[styles.inputLabel, { color: theme.onSurfaceVariant }]}>Client ID</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.onSurface,
                borderColor: theme.outline,
                backgroundColor: theme.background,
              },
            ]}
            placeholder="Paste Client ID (ends with .apps.googleusercontent.com)"
            placeholderTextColor={theme.onSurfaceVariant}
            value={clientId}
            onChangeText={setClientId}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={[styles.inputLabel, { color: theme.onSurfaceVariant }]}>Client Secret</Text>
          <TextInput
            style={[
              styles.input,
              {
                color: theme.onSurface,
                borderColor: theme.outline,
                backgroundColor: theme.background,
              },
            ]}
            placeholder="Paste Client Secret (starts with GOCSPX-)"
            placeholderTextColor={theme.onSurfaceVariant}
            value={clientSecret}
            onChangeText={setClientSecret}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry={false}
          />

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
  step: { fontSize: 14, lineHeight: 22, marginBottom: 4 },
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  inputLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  codeBox: {
    borderRadius: 2,
    padding: 10,
    marginVertical: 8,
  },
  codeText: { color: '#7DD3FC', fontFamily: 'monospace', fontSize: 13 },
  consoleBtn: { marginTop: 8, alignSelf: 'flex-start' },
  consoleBtnText: {
    fontSize: 13,
    color: '#60A5FA',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  input: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 12,
    fontSize: 13,
    marginBottom: 16,
    fontFamily: 'monospace',
  },
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
