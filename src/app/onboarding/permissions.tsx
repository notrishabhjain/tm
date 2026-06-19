import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { Screen } from '@/ui/components/Screen';
import NotificationListener from '../../../modules/notification-listener/src';

export default function OnboardingPermissionsScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [status, setStatus] = useState<'granted' | 'denied' | 'unknown'>('unknown');

  const checkStatus = async (): Promise<void> => {
    const s = await NotificationListener.getPermissionStatus();
    setStatus(s);
  };

  useEffect(() => {
    void checkStatus();

    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkStatus();
    });

    return () => sub.remove();
  }, []);

  const handleGrant = async (): Promise<void> => {
    await NotificationListener.openPermissionSettings();
  };

  const handleContinue = (): void => {
    void router.push('/onboarding/apps');
  };

  const granted = status === 'granted';

  return (
    <Screen>
      <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
        <View style={styles.content}>
          <Text style={[styles.stepLabel, { color: theme.primary }]}>Step 1 of 4</Text>
          <Text style={[styles.title, { color: theme.onSurface }]}>Grant Notification Access</Text>
          <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
            TaskMind needs Notification Access to read your notifications and identify actionable
            tasks. This permission is required for the app to work.
          </Text>

          <View style={[styles.statusCard, { backgroundColor: theme.surfaceVariant }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: granted ? Colors.success : Colors.urgentFg },
              ]}
            />
            <Text style={[styles.statusText, { color: theme.onSurface }]}>
              Notification Access:{' '}
              <Text
                style={[styles.statusBold, { color: granted ? Colors.success : Colors.urgentFg }]}
              >
                {granted ? 'Granted' : 'Not granted'}
              </Text>
            </Text>
          </View>

          <Text style={[styles.stepsTitle, { color: theme.onSurface }]}>How to grant access:</Text>
          {[
            'Tap "Open Settings" below',
            'Find TaskMind in the list',
            'Toggle it ON',
            'Come back here',
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <Text style={[styles.stepNum, { color: theme.primary }]}>{i + 1}.</Text>
              <Text style={[styles.step, { color: theme.onSurfaceVariant }]}>{step}</Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          {!granted && (
            <Button
              label="Open Settings"
              onPress={() => void handleGrant()}
              fullWidth
              variant="primary"
            />
          )}
          <Button
            label={granted ? 'Continue' : 'Skip for now'}
            onPress={handleContinue}
            fullWidth
            variant={granted ? 'primary' : 'secondary'}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    justifyContent: 'space-between',
  },
  content: { flex: 1 },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, marginBottom: 12 },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 14,
    marginBottom: 24,
  },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  statusText: { fontSize: 14 },
  statusBold: { fontWeight: '700' },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 10,
  },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  stepNum: { fontSize: 13, fontWeight: '700', minWidth: 16 },
  step: { fontSize: 13 },
  footer: { gap: 12 },
});
