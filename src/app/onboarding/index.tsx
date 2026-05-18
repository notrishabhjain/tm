import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';

export default function OnboardingWelcomeScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Text style={styles.logo}>TaskMind</Text>
        <Text style={styles.tagline}>Turn every notification into action.</Text>
        <Text style={styles.description}>
          TaskMind watches your WhatsApp, email, and other apps — and automatically creates
          actionable tasks from messages that need your attention.
        </Text>
        <Text style={styles.note}>No snooze. No defer. Just do it.</Text>
      </View>

      <View style={styles.footer}>
        <Button
          label="Get Started"
          onPress={() => void router.push('/onboarding/permissions')}
          fullWidth
        />
        <Text style={styles.privacyNote}>
          All processing happens on your device. Nothing leaves your phone.
        </Text>
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
  hero: {
    flex: 1,
    justifyContent: 'center',
  },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    color: Colors.white,
    marginBottom: 12,
    letterSpacing: -1,
  },
  tagline: {
    fontSize: 22,
    fontWeight: '300',
    color: Colors.primary100,
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    color: Colors.primary300,
    lineHeight: 26,
    marginBottom: 24,
  },
  note: {
    fontSize: 14,
    color: Colors.urgentFg,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  footer: {
    gap: 16,
  },
  privacyNote: {
    fontSize: 12,
    color: Colors.primary300,
    textAlign: 'center',
  },
});
