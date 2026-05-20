import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';

const LEVELS = [
  {
    label: 'URGENT',
    color: Colors.urgentFg,
    bg: Colors.urgentBgLight,
    desc: 'Deadlines today, critical issues — keywords like "urgent", "ASAP", "deadline"',
  },
  {
    label: 'HIGH',
    color: Colors.highFg,
    bg: Colors.highBgLight,
    desc: 'Action needed soon, VIP senders — keywords like "please review", "waiting for you"',
  },
  {
    label: 'MEDIUM',
    color: Colors.mediumFg,
    bg: Colors.mediumBgLight,
    desc: 'Standard action items, replies needed, follow-ups',
  },
  {
    label: 'LOW',
    color: Colors.lowFg,
    bg: Colors.lowBgLight,
    desc: 'FYIs, soft requests, informational messages',
  },
] as const;

export default function OnboardingPriorityScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.stepLabel}>Step 4 of 5</Text>
        <Text style={styles.title}>How Priorities Work</Text>
        <Text style={styles.description}>
          TaskMind automatically assigns priorities based on keywords and urgency signals in your
          notifications.
        </Text>

        <View style={styles.levels}>
          {LEVELS.map((level) => (
            <View key={level.label} style={[styles.levelCard, { backgroundColor: level.bg }]}>
              <View style={[styles.badge, { backgroundColor: level.color }]}>
                <Text style={styles.badgeText}>{level.label}</Text>
              </View>
              <Text style={styles.levelDesc}>{level.desc}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.learnNote}>
          TaskMind learns from your confirmations and dismissals over time.
        </Text>
      </View>

      <View style={styles.footer}>
        <Button
          label="Continue →"
          onPress={() => void router.push('/onboarding/nudges')}
          fullWidth
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
  title: { fontSize: 26, fontWeight: '700', color: Colors.primary900, marginBottom: 12 },
  description: {
    fontSize: 15,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 24,
    marginBottom: 20,
  },
  levels: { gap: 10, marginBottom: 20 },
  levelCard: {
    borderRadius: 10,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  badge: {
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    minWidth: 70,
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.white, letterSpacing: 0.5 },
  levelDesc: { flex: 1, fontSize: 13, color: Colors.onSurfaceLight, lineHeight: 20 },
  learnNote: {
    fontSize: 13,
    color: Colors.onSurfaceVariantLight,
    fontStyle: 'italic',
    lineHeight: 20,
  },
  footer: {},
});
