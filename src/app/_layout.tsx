import React, { useEffect, useRef } from 'react';
import { AppState, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
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
  const router = useRouter();
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
    // Mirror the Gemini key so the native call pipeline (GeminiCallAnalyzer) picks
    // up any user-set key — without this the native side only uses the bundled default.
    try {
      const geminiKey = getSetting('gemini_api_key');
      if (geminiKey) void NotificationListener.setGeminiApiKey(geminiKey).catch(() => {});
    } catch {
      /* non-fatal */
    }
    const t = setTimeout(() => void SplashScreen.hideAsync(), 300);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  // Two routes into the transcript importer, both checked on launch and on every
  // foreground:
  //
  //  - text shared in from another app (stashed natively before we were brought
  //    forward), and
  //  - the recorder having announced a finished transcription. The HyperOS
  //    Recorder offers no share, only "copy", so that notification is the only
  //    signal a transcript now exists; opening the importer puts the user one
  //    step from tasks instead of leaving them to remember.
  useEffect(() => {
    const check = (): void => {
      void (async () => {
        try {
          const shared = await NotificationListener.consumeSharedTranscript();
          if (shared?.trim()) {
            router.push({ pathname: '/import-transcript', params: { text: shared } });
            return;
          }
          const pending = await NotificationListener.consumeTranscriptImportPending();
          if (pending) {
            // No text passed: the importer reads the clipboard itself, which is
            // where the transcript will be once the user has copied it.
            router.push('/import-transcript');
          }
        } catch {
          /* native unavailable */
        }
      })();
    };
    check();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') check();
    });
    return () => sub.remove();
  }, [router]);

  // Live notifications (app open) run the same pipeline as headless.
  useEffect(() => {
    const sub = NotificationListener.addNotificationListener((data) => {
      void handleNotification({ notification: data });
    });
    return () => sub.remove();
  }, []);

  // On launch + every foreground, reconcile everything the background path may
  // have missed (ColorOS/MIUI love blocking background service starts):
  //  1. drain the native missed-notification queue into the pipeline
  //  2. sweep the notification tray for anything still sitting there
  //  3. process call recordings whose end-of-call trigger never fired
  //  4. flush the Google Tasks outbox
  //  5. re-analyse calls whose LLM pass failed
  useEffect(() => {
    const sweep = (): void => {
      void NotificationListener.drainPendingNotifications().catch(() => {});
      void NotificationListener.scanActiveNotifications().catch(() => {});
      void NotificationListener.scanForMissedCalls().catch(() => {});
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
              <Stack.Screen name="tasks" />
              <Stack.Screen name="review" />
              <Stack.Screen name="import-transcript" />
              <Stack.Screen name="oauth/google" />
            </Stack>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
