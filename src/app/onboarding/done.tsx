import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { setSetting } from '@/data/storage/settings';
import NotificationListener from '../../../modules/notification-listener/src';

const DEPTH = 4;

export default function OnboardingDoneScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const handleFinish = async (): Promise<void> => {
    setSetting('onboarding_complete', true);
    try {
      await NotificationListener.startService();
    } catch {
      // Non-fatal: foreground service may not start until NLS permission is granted
    }
    router.replace('/(tabs)');
  };

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 24,
        },
      ]}
    >
      <View style={styles.content}>
        <View style={[styles.checkWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={[styles.checkShadow, { backgroundColor: 'rgba(255,255,255,0.2)' }]} />
          <View style={styles.checkCard}>
            <View style={styles.checkFill} />
          </View>
        </View>

        <Text style={styles.title}>All set.</Text>
        <Text style={styles.description}>
          TaskMind is now monitoring your selected apps. Actionable messages will automatically
          appear as tasks on your home screen.
        </Text>

        <View style={[styles.reminderWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={[styles.reminderShadow, { backgroundColor: 'rgba(255,255,255,0.15)' }]} />
          <View style={styles.reminderCard}>
            <Text style={styles.reminderTitle}>Remember</Text>
            <View style={styles.reminderItem}>
              <View style={styles.bullet} />
              <Text style={styles.reminderText}>No snooze. No "later". Just act on tasks.</Text>
            </View>
            <View style={styles.reminderItem}>
              <View style={styles.bullet} />
              <Text style={styles.reminderText}>
                Check Settings → Diagnostics if something is not working.
              </Text>
            </View>
            <View style={styles.reminderItem}>
              <View style={styles.bullet} />
              <Text style={styles.reminderText}>
                For battery optimization: Settings → Device → Battery Guide.
              </Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Start Using TaskMind" onPress={() => void handleFinish()} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.primary900,
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  content: { flex: 1, justifyContent: 'center', gap: 24 },
  checkWrapper: { position: 'relative', alignSelf: 'flex-start' },
  checkShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  checkCard: {
    width: 56,
    height: 56,
    borderRadius: 2,
    backgroundColor: Colors.success,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkFill: { width: 20, height: 20, borderRadius: 2, backgroundColor: Colors.white },
  title: {
    fontSize: 36,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 24,
  },
  reminderWrapper: { position: 'relative' },
  reminderShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  reminderCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    padding: 16,
    gap: 10,
  },
  reminderTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.5)',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  reminderItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 1,
    backgroundColor: Colors.urgentFg,
    marginTop: 5,
  },
  reminderText: { flex: 1, fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 20 },
  footer: {},
});
