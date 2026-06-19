import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { Screen } from '@/ui/components/Screen';

const LEVELS = [
  {
    label: 'URGENT',
    fg: Colors.urgentFg,
    desc: 'Deadlines today, critical issues — keywords like "urgent", "ASAP", "deadline"',
  },
  {
    label: 'HIGH',
    fg: Colors.highFg,
    desc: 'Action needed soon, VIP senders — keywords like "please review", "waiting for you"',
  },
  {
    label: 'MEDIUM',
    fg: Colors.mediumFg,
    desc: 'Standard action items, replies needed, follow-ups',
  },
  {
    label: 'LOW',
    fg: Colors.lowFg,
    desc: 'FYIs, soft requests, informational messages',
  },
] as const;

export default function OnboardingPriorityScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={[styles.stepLabel, { color: theme.primary }]}>Step 4 of 5</Text>
          <Text style={[styles.title, { color: theme.onSurface }]}>How Priorities Work</Text>
          <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
            TaskMind automatically assigns priorities based on keywords and urgency signals in your
            notifications.
          </Text>

          <View style={styles.levels}>
            {LEVELS.map((level) => (
              <View
                key={level.label}
                style={[styles.levelCard, { backgroundColor: theme.surfaceVariant }]}
              >
                <View style={[styles.badge, { backgroundColor: level.fg }]}>
                  <Text style={styles.badgeText}>{level.label}</Text>
                </View>
                <Text style={[styles.levelDesc, { color: theme.onSurface }]}>{level.desc}</Text>
              </View>
            ))}
          </View>

          <Text style={[styles.learnNote, { color: theme.onSurfaceVariant }]}>
            TaskMind learns from your confirmations and dismissals over time.
          </Text>
        </View>

        <View style={styles.footer}>
          <Button
            label="Continue"
            onPress={() => void router.push('/onboarding/nudges')}
            fullWidth
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'space-between',
  },
  content: { flex: 1, paddingTop: 8 },
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
  levels: { gap: 10, marginBottom: 20 },
  levelCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    borderRadius: 14,
    padding: 14,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf: 'flex-start',
    minWidth: 68,
    alignItems: 'center',
  },
  badgeText: { fontSize: 11, fontWeight: '700', color: Colors.white, letterSpacing: 0.5 },
  levelDesc: { flex: 1, fontSize: 12, lineHeight: 18 },
  learnNote: {
    fontSize: 12,
    lineHeight: 18,
  },
  footer: {},
});
