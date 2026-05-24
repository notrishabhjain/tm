import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Link } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';

const DEPTH = 4;

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
          <Text style={styles.logo}>TaskMind</Text>
          <View style={styles.logoUnderline} />
        </View>
        <Text style={styles.tagline}>Turn every notification into action.</Text>
        <Text style={styles.description}>
          TaskMind watches your WhatsApp, email, and other apps — and automatically creates
          actionable tasks from messages that need your attention.
        </Text>
        <View style={styles.noteRow}>
          <View style={styles.noteDot} />
          <Text style={styles.note}>No snooze. No defer. Just do it.</Text>
        </View>
      </View>

      <View style={styles.footer}>
        <View style={[styles.btnWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={[styles.btnShadow, { backgroundColor: 'rgba(255,255,255,0.3)' }]} />
          <Link href="/onboarding/permissions" asChild>
            <Button label="Get Started" fullWidth />
          </Link>
        </View>
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
    paddingHorizontal: 32,
    justifyContent: 'space-between',
  },
  hero: { flex: 1, justifyContent: 'center' },
  logoWrapper: { marginBottom: 16 },
  logo: {
    fontSize: 40,
    fontWeight: '800',
    color: Colors.white,
    letterSpacing: -1,
  },
  logoUnderline: {
    height: 3,
    width: 80,
    backgroundColor: Colors.urgentFg,
    marginTop: 4,
    borderRadius: 1,
  },
  tagline: {
    fontSize: 20,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginBottom: 20,
  },
  description: {
    fontSize: 15,
    color: 'rgba(255,255,255,0.65)',
    lineHeight: 24,
    marginBottom: 28,
  },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  noteDot: {
    width: 8,
    height: 8,
    borderRadius: 2,
    backgroundColor: Colors.urgentFg,
  },
  note: {
    fontSize: 14,
    color: Colors.urgentFg,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: { gap: 16 },
  btnWrapper: { position: 'relative' },
  btnShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  privacyNote: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.45)',
    textAlign: 'center',
  },
});
