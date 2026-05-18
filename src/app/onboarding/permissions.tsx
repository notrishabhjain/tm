import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import NotificationListener from '../../../modules/notification-listener/src';

export default function OnboardingPermissionsScreen(): React.JSX.Element {
  const router = useRouter();
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

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.stepLabel}>Step 1 of 4</Text>
        <Text style={styles.title}>Grant Notification Access</Text>
        <Text style={styles.description}>
          TaskMind needs Notification Access to read your notifications and identify actionable
          tasks. This permission is required for the app to work.
        </Text>

        <View style={styles.statusCard}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: status === 'granted' ? Colors.success : Colors.error },
            ]}
          />
          <Text style={styles.statusText}>
            Notification Access:{' '}
            <Text style={{ fontWeight: '700' }}>
              {status === 'granted' ? 'Granted ✓' : 'Not granted'}
            </Text>
          </Text>
        </View>

        <View style={styles.steps}>
          <Text style={styles.stepsTitle}>How to grant access:</Text>
          <Text style={styles.step}>1. Tap "Open Settings" below</Text>
          <Text style={styles.step}>2. Find TaskMind in the list</Text>
          <Text style={styles.step}>3. Toggle it ON</Text>
          <Text style={styles.step}>4. Come back here</Text>
        </View>
      </View>

      <View style={styles.footer}>
        {status !== 'granted' && (
          <Button
            label="Open Settings"
            onPress={() => void handleGrant()}
            fullWidth
            variant="primary"
          />
        )}
        <Button
          label={status === 'granted' ? 'Continue →' : 'Skip for now'}
          onPress={handleContinue}
          fullWidth
          variant={status === 'granted' ? 'primary' : 'secondary'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.backgroundLight,
    padding: 24,
    justifyContent: 'space-between',
  },
  content: { flex: 1, paddingTop: 24 },
  stepLabel: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.primary900, marginBottom: 16 },
  description: {
    fontSize: 15,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 24,
    marginBottom: 24,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.surfaceLight,
    padding: 16,
    borderRadius: 8,
    elevation: 1,
    marginBottom: 24,
  },
  statusDot: { width: 12, height: 12, borderRadius: 6 },
  statusText: { fontSize: 14, color: Colors.onSurfaceLight },
  steps: { gap: 8 },
  stepsTitle: { fontSize: 14, fontWeight: '600', color: Colors.onSurfaceLight, marginBottom: 4 },
  step: { fontSize: 14, color: Colors.onSurfaceVariantLight },
  footer: { gap: 12 },
});
