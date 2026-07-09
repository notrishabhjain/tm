import React, { useEffect, useRef } from 'react';
import { AppState, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@/ui/theme';
import { initializeDatabase } from '@/data/db/client';
import { getSetting } from '@/data/storage/settings';
import { handleNotification, flushOutbox } from '@/services/pipeline';
import { retryFailedCallAnalyses } from '@/services/call-retry';
import { MESSAGING_APPS } from '@/services/app-name-map';
import NotificationListener from '../../modules/notification-listener/src';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 15, retry: 1 } },
});

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0A2540', padding: 24, paddingTop: 64 }}>
          <Text style={{ color: '#FF6B6B', fontSize: 16, fontWeight: '700', marginBottom: 10 }}>
            TaskMind crashed on startup
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 11, fontFamily: 'monospace' }}>
            {String(this.state.error)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout(): React.JSX.Element {
  const bootedRef = useRef(false);
  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
  });

  // Boot: DB, monitored apps, credential mirror, then reveal the app.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    try {
      initializeDatabase();
    } catch (err) {
      console.error('DB init error:', err);
    }
    // v2 monitors all messaging apps — pushed to the native filter on every boot.
    void NotificationListener.setMonitoredApps(MESSAGING_APPS).catch(() => {});
    // Mirror the Cloud-AI credentials for the native call pipeline.
    try {
      const key = getSetting('ai_api_key');
      const model = getSetting('ai_model');
      if (key) void NotificationListener.setAiCredentials(key, model || '').catch(() => {});
    } catch {
      /* non-fatal */
    }
    const t = setTimeout(() => void SplashScreen.hideAsync(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Live notifications (app open) run the same pipeline as headless.
  useEffect(() => {
    const sub = NotificationListener.addNotificationListener((data) => {
      void handleNotification({ notification: data });
    });
    return () => sub.remove();
  }, []);

  // On launch + every foreground, reconcile everything the background path may
  // have missed (ColorOS & friends love blocking background service starts):
  //  1. drain the native missed-notification queue into the pipeline
  //  2. sweep the notification tray for anything still sitting there
  //  3. flush the Google Tasks outbox
  //  4. re-analyse calls whose LLM pass failed
  useEffect(() => {
    const sweep = (): void => {
      void NotificationListener.drainPendingNotifications().catch(() => {});
      void NotificationListener.scanActiveNotifications().catch(() => {});
      void flushOutbox().catch(() => {});
      void retryFailedCallAnalyses().catch(() => {});
    };
    sweep();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') sweep();
    });
    return () => sub.remove();
  }, []);

  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="index" />
              <Stack.Screen name="oauth/google" />
            </Stack>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
