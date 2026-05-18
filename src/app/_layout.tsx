import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@/ui/theme';
import { initializeDatabase } from '@/data/db/client';
import { getSetting } from '@/data/storage/settings';
import { seedDatabaseIfNeeded } from '@/services/db-seeder';

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      retry: 1,
    },
  },
});

export default function RootLayout(): React.JSX.Element | null {
  const router = useRouter();
  const [dbReady, setDbReady] = useState(false);

  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
    'JetBrainsMono-Regular': require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
  });

  useEffect(() => {
    async function init(): Promise<void> {
      try {
        await initializeDatabase();
        await seedDatabaseIfNeeded();
        setDbReady(true);
      } catch (err) {
        console.error('DB init failed:', err);
        setDbReady(true); // Continue anyway, errors will surface in UI
      }
    }
    void init();
  }, []);

  useEffect(() => {
    if (fontsLoaded && dbReady) {
      void SplashScreen.hideAsync();
      const onboardingDone = getSetting('onboarding_complete');
      if (!onboardingDone) {
        router.replace('/onboarding');
      }
    }
  }, [fontsLoaded, dbReady, router]);

  if (!fontsLoaded || !dbReady) {
    return <View style={{ flex: 1, backgroundColor: '#0A2540' }} />;
  }

  return (
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
          </Stack>
        </GestureHandlerRootView>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
