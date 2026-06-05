import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { handleOAuthCallback } from '@/services/google-tasks';
import { Colors } from '@/ui/theme/colors';

export default function GoogleOAuthCallback(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');
  const [errorHint, setErrorHint] = useState('');

  useEffect(() => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    const fullUrl = `taskmind://oauth/google?${query}`;
    if (!params.code) {
      setErrorHint('No authorization code received. Check that your Client ID is a Desktop app credential.');
      setStatus('error');
      setTimeout(() => router.replace('/settings/google-tasks'), 3000);
      return;
    }
    void handleOAuthCallback(fullUrl).then((ok) => {
      setStatus(ok ? 'success' : 'error');
      if (!ok) {
        setErrorHint('Token exchange failed. Make sure you pasted both Client ID and Client Secret correctly.');
      }
      setTimeout(() => {
        router.replace('/settings/google-tasks');
      }, ok ? 1200 : 3000);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container}>
      {status === 'processing' && (
        <>
          <ActivityIndicator size="large" color={Colors.primary500} />
          <Text style={styles.text}>Connecting Google Tasks…</Text>
        </>
      )}
      {status === 'success' && <Text style={styles.text}>Connected! Taking you back…</Text>}
      {status === 'error' && (
        <>
          <Text style={styles.text}>Connection failed. Taking you back…</Text>
          {Boolean(errorHint) && <Text style={styles.hint}>{errorHint}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0A2540',
  },
  text: { color: '#FFFFFF', marginTop: 16, fontSize: 16, fontWeight: '600' },
  hint: { color: '#FFD27A', marginTop: 12, fontSize: 12, textAlign: 'center', paddingHorizontal: 24, lineHeight: 18 },
});
