import React, { useEffect, useRef } from 'react';
import { AppState, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { ThemeProvider } from '@/ui/theme';
import { initializeDatabase, db } from '@/data/db/client';
import { getSetting } from '@/data/storage/settings';
import { seedDatabaseIfNeeded } from '@/services/db-seeder';
import { handleNotification } from '@/services/notification-handler';
import { restoreNudgeFromSettings } from '@/services/nudge-scheduler';
import { runDailyDigestIfNeeded } from '@/services/ai-digest';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { stashCallTranscript } from '@/services/call-transcript-stash';
import { stashShare } from '@/services/share-stash';
import { syncPendingGoogleTasks } from '@/services/google-tasks-sync';
import NotificationListener from '../../modules/notification-listener/src';

// Subject marker the Termux hand-off script stamps on the share intent:
// "TASKMIND_CALL_TRANSCRIPT|<callEpochMs>|<callerLabel>"
const CALL_TRANSCRIPT_MARKER = 'TASKMIND_CALL_TRANSCRIPT|';

function parseCallTranscriptSubject(subject: string): { callTime: number; callerLabel: string } {
  const rest = subject.slice(CALL_TRANSCRIPT_MARKER.length);
  const sepIndex = rest.indexOf('|');
  const epochPart = sepIndex >= 0 ? rest.slice(0, sepIndex) : rest;
  const labelPart = sepIndex >= 0 ? rest.slice(sepIndex + 1) : '';
  const epochMs = Number(epochPart);
  return {
    callTime: Number.isFinite(epochMs) && epochMs > 0 ? epochMs : Date.now(),
    callerLabel: labelPart.trim() || 'Unknown',
  };
}

void SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 30, retry: 1 } },
});

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null; stack: string; componentStack: string }
> {
  state = { error: null as Error | null, stack: '', componentStack: '' };
  static getDerivedStateFromError(error: Error) {
    return { error, stack: error.stack ?? '' };
  }
  componentDidCatch(error: Error, info: { componentStack?: string | null }): void {
    this.setState({
      error,
      stack: error.stack ?? String(error),
      componentStack: info.componentStack ?? '',
    });
    // eslint-disable-next-line no-console
    console.error('AppErrorBoundary:', error, info.componentStack);
  }
  render() {
    if (this.state.error) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0A2540', padding: 16, paddingTop: 56 }}>
          <Text style={{ color: '#FF6B6B', fontSize: 16, fontWeight: '700', marginBottom: 10 }}>
            TaskMind crashed on startup
          </Text>
          <Text
            style={{ color: '#FFD27A', fontSize: 11, fontFamily: 'monospace', marginBottom: 8 }}
          >
            {String(this.state.error)}
          </Text>
          <Text
            style={{ color: '#A8C8FF', fontSize: 10, fontFamily: 'monospace', marginBottom: 8 }}
          >
            STACK:
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontFamily: 'monospace', marginBottom: 8 }}>
            {this.state.stack.slice(0, 2000)}
          </Text>
          <Text
            style={{ color: '#A8C8FF', fontSize: 10, fontFamily: 'monospace', marginBottom: 8 }}
          >
            COMPONENT STACK:
          </Text>
          <Text style={{ color: '#FFFFFF', fontSize: 9, fontFamily: 'monospace' }}>
            {this.state.componentStack.slice(0, 1500)}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout(): React.JSX.Element {
  const router = useRouter();

  // Refs track readiness without causing re-renders that could race with navigation.
  const dbReadyRef = useRef(false);
  const fontsReadyRef = useRef(false);
  const finalizedRef = useRef(false);

  const [fontsLoaded] = useFonts({
    'Inter-Regular': require('../../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../../assets/fonts/Inter-Bold.ttf'),
    'JetBrainsMono-Regular': require('../../assets/fonts/JetBrainsMono-Regular.ttf'),
  });

  // Called when both DB and fonts are ready (or timed out).
  function tryFinalize(): void {
    if (!finalizedRef.current && dbReadyRef.current && fontsReadyRef.current) {
      finalizedRef.current = true;
      void SplashScreen.hideAsync();
      const onboardingDone = getSetting('onboarding_complete');
      if (!onboardingDone) {
        router.replace('/onboarding');
      }
    }
  }

  // Hard fallback: reveal the app after 5 s no matter what.
  useEffect(() => {
    const t = setTimeout(() => {
      dbReadyRef.current = true;
      fontsReadyRef.current = true;
      tryFinalize();
    }, 5000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // DB init — synchronous schema setup, async seeding, then restore nudge schedule.
  useEffect(() => {
    async function boot(): Promise<void> {
      try {
        initializeDatabase();
        await seedDatabaseIfNeeded();
        const nudgeFreq = getSetting('nudge_freq_minutes');
        void restoreNudgeFromSettings(nudgeFreq);
        void runDailyDigestIfNeeded();
        // Purge tasks archived > 30 days ago (non-fatal)
        try {
          await new TaskRepository(db).purgeOldArchivedTasks();
        } catch {
          /* non-fatal */
        }
      } catch (err) {
        console.error('DB init error (non-fatal):', err);
      }
      dbReadyRef.current = true;
      tryFinalize();
    }
    void boot();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Font loading with 4 s timeout so a hung font load never blocks the app.
  useEffect(() => {
    if (fontsLoaded) {
      fontsReadyRef.current = true;
      tryFinalize();
      return;
    }
    const t = setTimeout(() => {
      fontsReadyRef.current = true;
      tryFinalize();
    }, 4000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fontsLoaded]);

  // Notification listener — attach once after mount.
  useEffect(() => {
    const sub = NotificationListener.addNotificationListener((data) => {
      void handleNotification({ notification: data });
    });
    return () => sub.remove();
  }, []);

  // In-app call transcription: the native CallTranscriptionService emits
  // this once whisper.cpp finishes transcribing the latest call recording.
  // Also clear the SharedPreferences stash so the resume-check below doesn't
  // deliver the same transcript a second time when the user opens the app.
  useEffect(() => {
    const sub = NotificationListener.addCallTranscriptReadyListener((data) => {
      stashCallTranscript({
        text: data.text,
        callTime: data.callTime,
        callerLabel: data.callerLabel,
      });
      void NotificationListener.clearPendingCallTranscript().catch(() => {});
      router.push('/call-transcript');
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persistent notification "Done ✓" quick action — complete the top pending task.
  useEffect(() => {
    const sub = NotificationListener.addQuickActionDoneTopListener(() => {
      void (async () => {
        try {
          const taskRepo = new TaskRepository(db);
          const pending = await taskRepo.getPendingTasks();
          const order: Record<string, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
          const top = [...pending].sort(
            (a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3)
          )[0];
          if (!top) return;
          await taskRepo.completeTask(top.id);
          await queryClient.invalidateQueries({ queryKey: ['tasks'] });
          const remaining = await taskRepo.getPendingTasks();
          const urgent = remaining.filter((t) => t.priority === 'URGENT');
          const sorted = [...remaining].sort(
            (a, b) => (order[a.priority] ?? 3) - (order[b.priority] ?? 3)
          );
          await NotificationListener.updatePersistentNotification({
            pendingCount: remaining.length,
            urgentCount: urgent.length,
            taskTexts: sorted.slice(0, 5).map((t) => t.title),
          });
        } catch {
          /* non-fatal */
        }
      })();
    });
    return () => sub.remove();
  }, []);

  // Resume check: if the app was backgrounded/killed while CallTranscriptionService
  // was running, the live sendEvent would have been dropped. The service also writes
  // the transcript to SharedPreferences — pick it up here whenever the app gains focus.
  useEffect(() => {
    const checkPendingTranscript = (): void => {
      void (async () => {
        try {
          const pending = await NotificationListener.peekPendingCallTranscript();
          if (!pending?.text) return;
          await NotificationListener.clearPendingCallTranscript().catch(() => {});
          stashCallTranscript({
            text: pending.text,
            callTime: pending.callTime,
            callerLabel: pending.callerLabel,
          });
          router.push('/call-transcript');
        } catch {
          // Native module unavailable
        }
      })();
    };

    checkPendingTranscript();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkPendingTranscript();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Google Tasks sync outbox: retry any task that never made it to Google
  // (background context killed mid-sync, transient network failure). Runs on
  // launch and every time the app returns to the foreground.
  useEffect(() => {
    void syncPendingGoogleTasks();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void syncPendingGoogleTasks();
    });
    return () => sub.remove();
  }, []);

  // Share intent: open share screen when app is brought to foreground with a shared text.
  // Call transcripts arrive the same way (Termux hand-off, see
  // settings/call-transcription.tsx) tagged with a TASKMIND_CALL_TRANSCRIPT subject —
  // those are routed to the dedicated review screen instead.
  useEffect(() => {
    const checkShare = (): void => {
      void (async () => {
        try {
          const intent = await NotificationListener.peekShareIntent();
          if (!intent?.text) return;

          const subject = intent.subject ?? '';
          if (subject.startsWith(CALL_TRANSCRIPT_MARKER)) {
            const { callTime, callerLabel } = parseCallTranscriptSubject(subject);
            stashCallTranscript({ text: intent.text, callTime, callerLabel });
            await NotificationListener.clearShareIntent().catch(() => null);
            router.push('/call-transcript');
            return;
          }

          // Clear the native intent BEFORE navigating — otherwise every
          // background→foreground cycle re-reads it and stacks another /share
          // modal (and backing out of the screen re-opened it forever).
          stashShare({ text: intent.text, subject: intent.subject ?? null });
          await NotificationListener.clearShareIntent().catch(() => null);
          router.push('/share');
        } catch {
          // Native module unavailable
        }
      })();
    };

    checkShare();
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkShare();
    });

    return () => {
      appStateSub.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // expo-router REQUIRES a navigator (Stack/Tabs/Slot) on every render,
  // including the very first one. Never return a plain View here.
  // The native splash screen (kept alive by preventAutoHideAsync above)
  // provides the loading UI until tryFinalize() calls hideAsync().
  return (
    <AppErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider>
            <View style={{ flex: 1 }}>
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
                <Stack.Screen name="settings/export-import" options={{ presentation: 'card' }} />
                <Stack.Screen name="settings/ai-model" options={{ presentation: 'card' }} />
                <Stack.Screen name="settings/analytics" options={{ presentation: 'card' }} />
                <Stack.Screen
                  name="settings/transcript-import"
                  options={{ presentation: 'card' }}
                />
                <Stack.Screen
                  name="settings/in-app-transcription"
                  options={{ presentation: 'card' }}
                />
                <Stack.Screen
                  name="settings/transcription-debug"
                  options={{ presentation: 'card' }}
                />
                <Stack.Screen name="settings/google-tasks" options={{ presentation: 'card' }} />
                <Stack.Screen name="settings/ai-cloud" options={{ presentation: 'card' }} />
                <Stack.Screen name="settings/focus-lock" options={{ presentation: 'card' }} />
                <Stack.Screen
                  name="call-transcript"
                  options={{ presentation: 'modal', headerShown: false }}
                />
                <Stack.Screen
                  name="task/create"
                  options={{ presentation: 'modal', headerShown: false }}
                />
                <Stack.Screen
                  name="share"
                  options={{ presentation: 'modal', headerShown: false }}
                />
              </Stack>
            </View>
          </ThemeProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
