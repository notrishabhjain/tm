import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { setSetting } from '@/data/storage/settings';
import NotificationListener from '../../../modules/notification-listener/src';

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
        <View style={styles.checkCard}>
          <View style={styles.checkFill} />
        </View>

        <Text style={[styles.title, { color: theme.onSurface }]}>All set.</Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          TaskMind is now monitoring your selected apps. Actionable messages will automatically
          appear as tasks on your home screen.
        </Text>

        <View style={[styles.reminderCard, { backgroundColor: theme.surfaceVariant }]}>
          <Text style={[styles.reminderTitle, { color: theme.onSurfaceVariant }]}>Remember</Text>
          <View style={styles.reminderItem}>
            <View style={styles.bullet} />
            <Text style={[styles.reminderText, { color: theme.onSurfaceVariant }]}>
              No snooze. No "later". Just act on tasks.
            </Text>
          </View>
          <View style={styles.reminderItem}>
            <View style={styles.bullet} />
            <Text style={[styles.reminderText, { color: theme.onSurfaceVariant }]}>
              Check Settings → Diagnostics if something is not working.
            </Text>
          </View>
          <View style={styles.reminderItem}>
            <View style={styles.bullet} />
            <Text style={[styles.reminderText, { color: theme.onSurfaceVariant }]}>
              For battery optimization: Settings → Device → Battery Guide.
            </Text>
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
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  content: { flex: 1, justifyContent: 'center', gap: 24 },
  checkCard: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: Colors.primary500,
    alignSelf: 'flex-start',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkFill: { width: 20, height: 20, borderRadius: 6, backgroundColor: Colors.white },
  title: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
  },
  reminderCard: {
    borderRadius: 16,
    padding: 16,
    gap: 10,
  },
  reminderTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  reminderItem: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  bullet: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.primary500,
    marginTop: 5,
  },
  reminderText: { flex: 1, fontSize: 13, lineHeight: 20 },
  footer: {},
});
