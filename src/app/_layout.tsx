import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@/ui/theme';
import { initializeDatabase } from '@/data/db/client';
import { getSetting } from '@/data/storage/settings';
import { seedDatabaseIfNeeded } from '@/services/db-seeder';
import { handleNotification } from '@/services/notification-handler';
import NotificationListener from '../../modules/notification-listener/src';
import '@/i18n';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

// Top-level error boundary — catches any React render crash and shows the
// error message on screen instead of a blank white display.
class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <View
          style={{ flex: 1, backgroundColor: '#0A2540', justifyContent: 'center', padding: 24 }}
        >
          <Text style={{ color: '#FF6B6B', fontSize: 16, fontWeight: '700', marginBottom: 12 }}>
            TaskMind crashed on startup
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontFamily: 'monospace' }}>
            {String(this.state.error)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout(): React.JSX.Element | null {
  const router = useRouter();
  const [dbReady, setDbReady] = useState(false);
  // Allow at most 4 seconds for fonts; proceed without them if they time out
  // so the user never sees a permanent blank screen due to a font-load failure.
  const [fontsReady, setFontsReady] = useState(false);
  const fontTimerFired = useRef(false);

  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
    'JetBrainsMono-Regular': require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
  });

  // Resolve fontsReady either when fonts actually load or after a timeout.
  useEffect(() => {
    if (fontsLoaded && !fontsReady) {
      setFontsReady(true);
      return;
    }
    const timer = setTimeout(() => {
      if (!fontTimerFired.current) {
        fontTimerFired.current = true;
        setFontsReady(true);
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [fontsLoaded, fontsReady]);

  useEffect(() => {
    // Safety timeout: if init hangs for any reason, proceed anyway after 3s.
    const safetyTimer = setTimeout(() => setDbReady(true), 3000);
    async function init(): Promise<void> {
      try {
        initializeDatabase(); // synchronous — no async queue dependency
        await seedDatabaseIfNeeded();
      } catch (err) {
        console.error('DB init failed:', err);
      } finally {
        clearTimeout(safetyTimer);
        setDbReady(true);
      }
    }
    void init();
    return () => clearTimeout(safetyTimer);
  }, []);

  useEffect(() => {
    if (fontsReady && dbReady) {
      void SplashScreen.hideAsync();
      const onboardingDone = getSetting('onboarding_complete');
      if (!onboardingDone) {
        router.replace('/onboarding');
      }
    }
  }, [fontsReady, dbReady, router]);

  useEffect(() => {
    if (!dbReady) return;
    const sub = NotificationListener.addNotificationListener((data) => {
      void handleNotification({ notification: data });
    });
    return () => sub.remove();
  }, [dbReady]);

  if (!fontsReady || !dbReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0A2540',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Text style={{ color: '#FFFFFF', fontSize: 18, fontWeight: '700', letterSpacing: 1 }}>
          TaskMind
        </Text>
        <Text style={{ color: '#6B8FBF', fontSize: 12, marginTop: 8 }}>Loading…</Text>
      </View>
    );
  }

  return (
    <AppErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="onboarding" options={{ headerShown: false }} />
              <Stack.Screen name="task/[id]" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings/diagnostics" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings/vocabulary" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings/email-report" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings/battery-guide" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings/monitored-apps" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings/vip-contacts" options={{ presentation: 'card' }} />
              <Stack.Screen name="settings/nudges" options={{ presentation: 'card' }} />
            </Stack>
          </GestureHandlerRootView>
        </ThemeProvider>
      </QueryClientProvider>
    </AppErrorBoundary>
  );
}
