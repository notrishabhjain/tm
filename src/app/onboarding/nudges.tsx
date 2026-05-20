import React, { useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import { setSetting } from '@/data/storage/settings';

const FREQUENCY_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every hour', value: 60 },
  { label: 'Every 2 hours', value: 120 },
  { label: 'Every 4 hours', value: 240 },
] as const;

export default function OnboardingNudgesScreen(): React.JSX.Element {
  const router = useRouter();
  const [frequencyMinutes, setFrequencyMinutes] = useState<number>(60);
  const [urgentOverride, setUrgentOverride] = useState<boolean>(true);

  const handleContinue = (): void => {
    setSetting('nudge_freq_minutes', frequencyMinutes);
    setSetting('urgent_override_quiet', urgentOverride);
    void router.push('/onboarding/done');
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.stepLabel}>Step 5 of 5</Text>
        <Text style={styles.title}>Configure Nudges</Text>
        <Text style={styles.description}>
          TaskMind can send a persistent notification reminding you of pending tasks. Configure when
          and how often.
        </Text>

        <Text style={styles.sectionLabel}>Nudge frequency</Text>
        <View style={styles.optionList}>
          {FREQUENCY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.option, frequencyMinutes === opt.value && styles.optionSelected]}
              onPress={() => setFrequencyMinutes(opt.value)}
            >
              <View
                style={[styles.radio, frequencyMinutes === opt.value && styles.radioSelected]}
              />
              <Text
                style={[
                  styles.optionLabel,
                  frequencyMinutes === opt.value && styles.optionLabelSelected,
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <View style={styles.toggleRow}>
          <View style={styles.toggleLabel}>
            <Text style={styles.toggleTitle}>Urgent overrides quiet hours</Text>
            <Text style={styles.toggleSubtitle}>
              URGENT tasks always nudge, even during quiet hours
            </Text>
          </View>
          <Switch
            value={urgentOverride}
            onValueChange={setUrgentOverride}
            trackColor={{ true: Colors.primary500 }}
            thumbColor={Colors.white}
          />
        </View>
      </View>

      <View style={styles.footer}>
        <Button label="Continue →" onPress={handleContinue} fullWidth />
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
    marginBottom: 24,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 12,
  },
  optionList: { gap: 8, marginBottom: 24 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 10,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  optionSelected: { borderColor: Colors.primary500, backgroundColor: Colors.primary50 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: Colors.onSurfaceVariantLight,
  },
  radioSelected: { borderColor: Colors.primary500, backgroundColor: Colors.primary500 },
  optionLabel: { fontSize: 15, color: Colors.onSurfaceLight },
  optionLabelSelected: { color: Colors.primary900, fontWeight: '600' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surfaceLight,
    padding: 16,
    borderRadius: 10,
    gap: 12,
  },
  toggleLabel: { flex: 1 },
  toggleTitle: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  toggleSubtitle: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginTop: 2 },
  footer: { gap: 12 },
});
