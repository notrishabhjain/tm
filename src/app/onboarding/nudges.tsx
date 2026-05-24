import React, { useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { setSetting } from '@/data/storage/settings';

const FREQUENCY_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every hour', value: 60 },
  { label: 'Every 2 hours', value: 120 },
  { label: 'Every 4 hours', value: 240 },
] as const;

const DEPTH = 4;

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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.content}>
        <Text style={[styles.stepLabel, { color: theme.primary }]}>STEP 5 OF 5</Text>
        <Text style={[styles.title, { color: theme.primary }]}>Configure Nudges</Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          TaskMind can send a persistent notification reminding you of pending tasks. Configure when
          and how often.
        </Text>

        <Text style={[styles.sectionLabel, { color: theme.primary }]}>NUDGE FREQUENCY</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
            {FREQUENCY_OPTIONS.map((opt, i) => (
              <Pressable
                key={opt.value}
                style={[
                  styles.optionRow,
                  i < FREQUENCY_OPTIONS.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: theme.outline,
                  },
                  frequencyMinutes === opt.value && styles.optionSelected,
                  frequencyMinutes === opt.value && { backgroundColor: theme.pressHighlight },
                ]}
                onPress={() => setFrequencyMinutes(opt.value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: frequencyMinutes === opt.value }}
              >
                <View
                  style={[
                    styles.radio,
                    { borderColor: theme.onSurfaceVariant },
                    frequencyMinutes === opt.value && styles.radioSelected,
                    frequencyMinutes === opt.value && {
                      borderColor: theme.primary,
                      backgroundColor: theme.primary,
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
        </View>

        <Text style={[styles.sectionLabel, { color: theme.primary }]}>BEHAVIOUR</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
          <View style={[styles.card, { backgroundColor: theme.surface }]}>
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
                trackColor={{ true: theme.primary, false: theme.outline }}
                thumbColor={Colors.white}
              />
            </View>
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 8,
  },
  cardWrapper: { position: 'relative', marginBottom: 16 },
  cardShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  card: {
    borderWidth: 2,
    borderColor: Colors.neoShadowDefault,
    borderRadius: 2,
    overflow: 'hidden',
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  optionSelected: {},
  radio: {
    width: 18,
    height: 18,
    borderRadius: 2,
    borderWidth: 2,
  },
  radioSelected: {},
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
