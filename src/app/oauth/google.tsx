import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { handleOAuthCallback } from '@/services/google-tasks';
import { Colors } from '@/ui/theme/colors';

export default function GoogleOAuthCallback(): React.JSX.Element {
  const router = useRouter();
  const params = useLocalSearchParams<{ code?: string; state?: string; error?: string }>();
  const [status, setStatus] = useState<'processing' | 'success' | 'error'>('processing');

  useEffect(() => {
    const query = new URLSearchParams(params as Record<string, string>).toString();
    const fullUrl = `taskmind://oauth/google?${query}`;
    void handleOAuthCallback(fullUrl).then((ok) => {
      setStatus(ok ? 'success' : 'error');
      setTimeout(() => {
        router.replace('/settings/google-tasks');
      }, 1200);
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
      {status === 'error' && <Text style={styles.text}>Connection failed. Taking you back…</Text>}
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
});
