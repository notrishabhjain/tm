import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import { setSetting } from '@/data/storage/settings';
import NotificationListener from '../../../modules/notification-listener/src';

export default function OnboardingDoneScreen(): React.JSX.Element {
  const router = useRouter();

  const handleFinish = async (): Promise<void> => {
    setSetting('onboarding_complete', true);
    await NotificationListener.startService();
    router.replace('/(tabs)');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.checkCircle}>
          <Text style={styles.checkIcon}>✓</Text>
        </View>
        <Text style={styles.title}>You're all set!</Text>
        <Text style={styles.description}>
          TaskMind is now monitoring your selected apps. Actionable messages will automatically
          appear as tasks on your home screen.
        </Text>

        <View style={styles.reminderCard}>
          <Text style={styles.reminderTitle}>Remember</Text>
          <Text style={styles.reminderItem}>• No snooze. No "later". Just act on tasks.</Text>
          <Text style={styles.reminderItem}>
            • Check Settings → Diagnostics if something isn't working.
          </Text>
          <Text style={styles.reminderItem}>
            • For battery optimization: Settings → Device → Battery Guide.
          </Text>
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
    padding: 32,
    justifyContent: 'space-between',
  },
  content: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: Colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  checkIcon: { fontSize: 36, color: Colors.white, fontWeight: '700' },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: Colors.primary300,
    lineHeight: 26,
    textAlign: 'center',
    marginBottom: 32,
  },
  reminderCard: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 12,
    padding: 20,
    alignSelf: 'stretch',
    gap: 10,
  },
  reminderTitle: { fontSize: 14, fontWeight: '700', color: Colors.primary100, marginBottom: 4 },
  reminderItem: { fontSize: 13, color: Colors.primary300, lineHeight: 20 },
  footer: {},
});
