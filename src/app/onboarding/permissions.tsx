import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import NotificationListener from '../../../modules/notification-listener/src';

const DEPTH = 4;

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
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 24,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.content}>
        <Text style={[styles.stepLabel, { color: theme.primary }]}>STEP 1 OF 4</Text>
        <Text style={[styles.title, { color: theme.primary }]}>Grant Notification Access</Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          TaskMind needs Notification Access to read your notifications and identify actionable
          tasks. This permission is required for the app to work.
        </Text>

        <View style={[styles.statusWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View
            style={[
              styles.statusShadow,
              { backgroundColor: granted ? Colors.neoShadowDefault : Colors.neoShadowUrgent },
            ]}
          />
          <View
            style={[
              styles.statusCard,
              {
                borderColor: granted ? Colors.success : Colors.urgentFg,
                backgroundColor: theme.surface,
              },
            ]}
          >
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
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
  },
  content: { flex: 1 },
  stepLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  title: { fontSize: 26, fontWeight: '800', marginBottom: 12 },
  description: {
    fontSize: 14,
    lineHeight: 22,
    marginBottom: 20,
  },
  statusWrapper: { position: 'relative', marginBottom: 24 },
  statusShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderWidth: 2,
    borderRadius: 2,
  },
  statusDot: { width: 10, height: 10, borderRadius: 2 },
  statusText: { fontSize: 14 },
  statusBold: { fontWeight: '700' },
  stepsTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 10,
  },
  stepRow: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  stepNum: { fontSize: 13, fontWeight: '700', minWidth: 16 },
  step: { fontSize: 13 },
  footer: { gap: 12 },
});
