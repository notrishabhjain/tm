import React, { useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { Screen } from '@/ui/components/Screen';
import { setSetting } from '@/data/storage/settings';

const FREQUENCY_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every hour', value: 60 },
  { label: 'Every 2 hours', value: 120 },
  { label: 'Every 4 hours', value: 240 },
] as const;

export default function OnboardingNudgesScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const [frequencyMinutes, setFrequencyMinutes] = useState<number>(60);
  const [urgentOverride, setUrgentOverride] = useState<boolean>(true);

  const handleContinue = (): void => {
    setSetting('nudge_freq_minutes', frequencyMinutes);
    setSetting('urgent_override_quiet', urgentOverride);
    void router.push('/onboarding/done');
  };

  return (
    <Screen>
      <View style={styles.container}>
        <View style={styles.content}>
          <Text style={[styles.stepLabel, { color: theme.primary }]}>Step 5 of 5</Text>
          <Text style={[styles.title, { color: theme.onSurface }]}>Configure Nudges</Text>
          <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
            TaskMind can send a persistent notification reminding you of pending tasks. Configure
            when and how often.
          </Text>

          <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
            Nudge frequency
          </Text>
          <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
            {FREQUENCY_OPTIONS.map((opt, i) => (
              <Pressable
                key={opt.value}
                style={({ pressed }) => [
                  styles.optionRow,
                  i < FREQUENCY_OPTIONS.length - 1 && {
                    borderBottomWidth: 0.5,
                    borderBottomColor: theme.outline,
                  },
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => setFrequencyMinutes(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: frequencyMinutes === opt.value }}
              >
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.onSurfaceVariant },
                    frequencyMinutes === opt.value && {
                      borderColor: Colors.primary500,
                      backgroundColor: Colors.primary500,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.optionLabel,
                    { color: theme.onSurface },
                    frequencyMinutes === opt.value && styles.optionLabelSelected,
                    frequencyMinutes === opt.value && { color: theme.primary },
                  ]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Behaviour</Text>
          <View style={[styles.card, { backgroundColor: theme.surfaceVariant }]}>
            <View style={styles.toggleRow}>
              <View style={styles.toggleInfo}>
                <Text style={[styles.toggleTitle, { color: theme.onSurface }]}>
                  Urgent overrides quiet hours
                </Text>
                <Text style={[styles.toggleSubtitle, { color: theme.onSurfaceVariant }]}>
                  URGENT tasks always nudge, even during quiet hours
                </Text>
              </View>
              <Switch
                value={urgentOverride}
                onValueChange={setUrgentOverride}
                trackColor={{ true: Colors.primary500, false: theme.outline }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Button label="Continue" onPress={handleContinue} fullWidth />
          <Button
            label="Skip for now"
            onPress={() => void router.push('/onboarding/done')}
            fullWidth
            variant="secondary"
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
  content: { flex: 1 },
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 16,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },
  optionLabel: { fontSize: 15 },
  optionLabelSelected: { fontWeight: '700' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleTitle: { fontSize: 15, fontWeight: '600' },
  toggleSubtitle: { fontSize: 12, marginTop: 2 },
  footer: { gap: 12 },
});
