import React, { useState } from 'react';
import { View, Text, Pressable, Switch, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { getSetting, setSetting } from '@/data/storage/settings';
import { scheduleNudge, cancelNudge } from '@/services/nudge-scheduler';

const FREQUENCY_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: 'Every 15 min', value: 15 },
  { label: 'Every 30 min', value: 30 },
  { label: 'Every hour', value: 60 },
  { label: 'Every 2 hours', value: 120 },
  { label: 'Every 4 hours', value: 240 },
] as const;

export default function NudgesScreen(): React.JSX.Element {
  const router = useRouter();
  const [frequencyMinutes, setFrequencyMinutes] = useState<number>(
    getSetting('nudge_freq_minutes')
  );
  const [urgentOverride, setUrgentOverride] = useState<boolean>(
    getSetting('urgent_override_quiet')
  );

  const handleFrequency = (value: number): void => {
    setFrequencyMinutes(value);
    setSetting('nudge_freq_minutes', value);
    if (value === 0) {
      void cancelNudge();
    } else {
      void scheduleNudge(value);
    }
  };

  const handleUrgentOverride = (value: boolean): void => {
    setUrgentOverride(value);
    setSetting('urgent_override_quiet', value);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>Nudge Schedule</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          TaskMind shows a persistent notification reminding you of pending tasks. Configure how
          often it refreshes with updated counts.
        </Text>

        <Text style={styles.sectionLabel}>NUDGE FREQUENCY</Text>
        <View style={styles.card}>
          {FREQUENCY_OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.value}
              style={[
                styles.optionRow,
                i < FREQUENCY_OPTIONS.length - 1 && styles.rowBorder,
                frequencyMinutes === opt.value && styles.optionSelected,
              ]}
              onPress={() => handleFrequency(opt.value)}
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

        <Text style={styles.sectionLabel}>BEHAVIOUR</Text>
        <View style={styles.card}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleInfo}>
              <Text style={styles.toggleTitle}>Urgent overrides quiet hours</Text>
              <Text style={styles.toggleSubtitle}>
                URGENT tasks always nudge, even during quiet hours
              </Text>
            </View>
            <Switch
              value={urgentOverride}
              onValueChange={handleUrgentOverride}
              trackColor={{ true: Colors.primary500, false: Colors.outlineLight }}
              thumbColor={Colors.white}
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
    gap: 12,
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 17, color: Colors.primary500 },
  title: { fontSize: 17, fontWeight: '600', color: Colors.onSurfaceLight },
  content: { padding: 16, paddingBottom: 32 },
  description: {
    fontSize: 14,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 1,
    marginBottom: 24,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.outlineLight },
  optionSelected: { backgroundColor: Colors.primary50 },
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleTitle: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  toggleSubtitle: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginTop: 2 },
});
