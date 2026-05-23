import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  Switch,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
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

const DEPTH = 4;

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim());
}

export default function NudgesScreen(): React.JSX.Element {
  const router = useRouter();
  const [frequencyMinutes, setFrequencyMinutes] = useState<number>(
    getSetting('nudge_freq_minutes')
  );
  const [urgentOverride, setUrgentOverride] = useState<boolean>(
    getSetting('urgent_override_quiet')
  );
  const [quietStart, setQuietStart] = useState<string>(getSetting('quiet_hours_start'));
  const [quietEnd, setQuietEnd] = useState<string>(getSetting('quiet_hours_end'));
  const [quietEnabled, setQuietEnabled] = useState<boolean>(frequencyMinutes > 0);

  const handleFrequency = (value: number): void => {
    setFrequencyMinutes(value);
    setSetting('nudge_freq_minutes', value);
    setQuietEnabled(value > 0);
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

  const handleSaveQuietHours = (): void => {
    if (!isValidTime(quietStart)) {
      Alert.alert('Invalid time', 'Start time must be in HH:MM format (e.g. 22:00).');
      return;
    }
    if (!isValidTime(quietEnd)) {
      Alert.alert('Invalid time', 'End time must be in HH:MM format (e.g. 07:00).');
      return;
    }
    setSetting('quiet_hours_start', quietStart.trim());
    setSetting('quiet_hours_end', quietEnd.trim());
    Alert.alert('Saved', `Quiet hours set to ${quietStart.trim()} – ${quietEnd.trim()}.`);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Nudge Schedule</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          TaskMind shows a persistent notification reminding you of pending tasks. Configure how
          often it nudges you.
        </Text>

        <Text style={styles.sectionLabel}>NUDGE FREQUENCY</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
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
                accessibilityRole="radio"
                accessibilityState={{ selected: frequencyMinutes === opt.value }}
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
        </View>

        {/* Quiet Hours */}
        <Text style={styles.sectionLabel}>QUIET HOURS</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
          <View style={styles.card}>
            <View style={styles.quietRow}>
              <View style={styles.quietField}>
                <Text style={styles.quietFieldLabel}>FROM</Text>
                <View
                  style={[
                    styles.timeInputWrapper,
                    { paddingRight: DEPTH / 2, paddingBottom: DEPTH / 2 },
                  ]}
                >
                  <View style={styles.timeInputShadow} />
                  <TextInput
                    style={[styles.timeInput, !quietEnabled && styles.timeInputDisabled]}
                    value={quietStart}
                    onChangeText={setQuietStart}
                    placeholder="22:00"
                    placeholderTextColor={Colors.onSurfaceVariantLight}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    editable={quietEnabled}
                    selectTextOnFocus
                  />
                </View>
              </View>
              <Text style={styles.quietSeparator}>—</Text>
              <View style={styles.quietField}>
                <Text style={styles.quietFieldLabel}>TO</Text>
                <View
                  style={[
                    styles.timeInputWrapper,
                    { paddingRight: DEPTH / 2, paddingBottom: DEPTH / 2 },
                  ]}
                >
                  <View style={styles.timeInputShadow} />
                  <TextInput
                    style={[styles.timeInput, !quietEnabled && styles.timeInputDisabled]}
                    value={quietEnd}
                    onChangeText={setQuietEnd}
                    placeholder="07:00"
                    placeholderTextColor={Colors.onSurfaceVariantLight}
                    keyboardType="numbers-and-punctuation"
                    maxLength={5}
                    editable={quietEnabled}
                    selectTextOnFocus
                  />
                </View>
              </View>
              <Pressable
                style={[styles.saveTimeBtn, !quietEnabled && styles.saveTimeBtnDisabled]}
                onPress={handleSaveQuietHours}
                disabled={!quietEnabled}
              >
                <Text style={styles.saveTimeBtnText}>Save</Text>
              </Pressable>
            </View>
            {!quietEnabled && (
              <Text style={styles.quietDisabledHint}>Enable nudges to configure quiet hours</Text>
            )}
          </View>
        </View>

        <Text style={styles.sectionLabel}>BEHAVIOUR</Text>
        <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.cardShadow} />
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
                trackColor={{ true: Colors.primary900, false: Colors.outlineLight }}
                thumbColor={Colors.white}
              />
            </View>
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
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: Colors.primary900,
    borderBottomWidth: 2,
    borderBottomColor: Colors.black,
  },
  backBtn: { padding: 4, minWidth: 56 },
  backText: { fontSize: 15, color: Colors.white, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '800', color: Colors.white },
  content: { padding: 16, paddingBottom: 32 },
  description: {
    fontSize: 13,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.primary900,
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 8,
  },
  cardWrapper: { position: 'relative', marginBottom: 20 },
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
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.primary900,
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
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.outlineLight },
  optionSelected: { backgroundColor: Colors.primary50 },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 2,
    borderWidth: 2,
    borderColor: Colors.onSurfaceVariantLight,
  },
  radioSelected: { borderColor: Colors.primary900, backgroundColor: Colors.primary900 },
  optionLabel: { fontSize: 15, color: Colors.onSurfaceLight },
  optionLabelSelected: { color: Colors.primary900, fontWeight: '700' },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  quietField: { gap: 6 },
  quietFieldLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: Colors.onSurfaceVariantLight,
    letterSpacing: 0.8,
  },
  timeInputWrapper: { position: 'relative' },
  timeInputShadow: {
    position: 'absolute',
    top: DEPTH / 2,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  timeInput: {
    width: 72,
    height: 42,
    backgroundColor: Colors.surfaceLight,
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '700',
    color: Colors.onSurfaceLight,
  },
  timeInputDisabled: {
    borderColor: Colors.outlineLight,
    color: Colors.onSurfaceVariantLight,
    backgroundColor: Colors.backgroundLight,
  },
  quietSeparator: {
    fontSize: 18,
    color: Colors.onSurfaceVariantLight,
    fontWeight: '700',
    marginBottom: 6,
  },
  saveTimeBtn: {
    flex: 1,
    height: 42,
    backgroundColor: Colors.primary900,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: Colors.black,
  },
  saveTimeBtnDisabled: {
    backgroundColor: Colors.outlineLight,
    borderColor: Colors.outlineLight,
  },
  saveTimeBtnText: { fontSize: 13, fontWeight: '800', color: Colors.white, letterSpacing: 0.5 },
  quietDisabledHint: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  toggleInfo: { flex: 1 },
  toggleTitle: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '600' },
  toggleSubtitle: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginTop: 2 },
});
