import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';

// Keep the splash screen visible while we initialize
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  useEffect(() => {
    // TODO: run migrations + seed DB here before hiding splash
    SplashScreen.hideAsync();
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: true, title: 'Task' }} />
        <Stack.Screen name="transcript" options={{ headerShown: true, title: 'Import Transcript' }} />
        <Stack.Screen name="settings/diagnostics" options={{ headerShown: true, title: 'Diagnostics' }} />
        <Stack.Screen name="settings/vip-contacts" options={{ headerShown: true, title: 'VIP Contacts' }} />
        <Stack.Screen name="settings/monitored-apps" options={{ headerShown: true, title: 'Monitored Apps' }} />
        <Stack.Screen name="settings/email-report" options={{ headerShown: true, title: 'Email Report' }} />
        <Stack.Screen name="settings/learned-vocabulary" options={{ headerShown: true, title: 'Learned Vocabulary' }} />
      </Stack>
    </>
  );
}
