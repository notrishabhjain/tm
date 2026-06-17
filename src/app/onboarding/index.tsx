import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';

export default function OnboardingWelcomeScreen(): React.JSX.Element {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 32,
          paddingBottom: insets.bottom + 32,
        },
      ]}
    >
      <View style={styles.hero}>
        <View style={styles.logoWrapper}>
          <Text style={[styles.logo, { color: theme.onSurface }]}>TaskMind</Text>
          <View style={styles.logoUnderline} />
        </View>
        <Text style={[styles.tagline, { color: theme.onSurface }]}>
          Turn every notification into action.
        </Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          TaskMind watches your WhatsApp, email, and other apps — and automatically creates
          actionable tasks from messages that need your attention.
        </Text>
        <View style={styles.noteRow}>
          <View style={styles.noteDot} />
          <Text style={[styles.note, { color: theme.primary }]}>
            No snooze. No defer. Just do it.
          </Text>
        </View>
      </View>

      <View style={styles.footer}>
        <Link href="/onboarding/permissions" asChild>
          <Button label="Get Started" fullWidth />
        </Link>
        <Text style={[styles.privacyNote, { color: theme.onSurfaceVariant }]}>
          All processing happens on your device. Nothing leaves your phone.
        </Text>
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
  hero: { flex: 1, justifyContent: 'center' },
  logoWrapper: { marginBottom: 16 },
  logo: {
    fontSize: 40,
    fontWeight: '700',
    letterSpacing: -1,
  },
  logoUnderline: {
    height: 3,
    width: 80,
    backgroundColor: Colors.primary500,
    marginTop: 8,
    borderRadius: 2,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 20,
  },
  description: {
    fontSize: 15,
    lineHeight: 24,
    marginBottom: 28,
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.primary500,
  },
  note: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: { gap: 16 },
  privacyNote: {
    fontSize: 12,
    textAlign: 'center',
  },
});
