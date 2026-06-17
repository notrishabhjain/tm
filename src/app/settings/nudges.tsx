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
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
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

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim());
}

export default function NudgesScreen(): React.JSX.Element {
  const theme = useTheme();
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
    <Screen>
      <LargeHeader title="Nudges" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          TaskMind shows a persistent notification reminding you of pending tasks. Configure how
          often it nudges you.
        </Text>

        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
          Nudge frequency
        </Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          {FREQUENCY_OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.value}
              style={({ pressed }) => [
                styles.optionRow,
                i < FREQUENCY_OPTIONS.length - 1 && {
                  borderBottomWidth: 0.5,
                  borderBottomColor: theme.outline,
                },
                frequencyMinutes === opt.value && { backgroundColor: theme.surfaceVariant },
                pressed && { opacity: 0.7 },
              ]}
              onPress={() => handleFrequency(opt.value)}
              accessibilityRole="radio"
              accessibilityState={{ selected: frequencyMinutes === opt.value }}
            >
              <View
                style={[
                  styles.radio,
                  { borderColor: theme.onSurfaceVariant },
                  frequencyMinutes === opt.value && styles.radioSelected,
                ]}
              />
              <Text
                style={[
                  styles.optionLabel,
                  { color: theme.onSurface },
                  frequencyMinutes === opt.value && styles.optionLabelSelected,
                  frequencyMinutes === opt.value && { color: Colors.primary500 },
                ]}
              >
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Quiet Hours */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Quiet hours</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <View style={styles.quietRow}>
            <View style={styles.quietField}>
              <Text style={[styles.quietFieldLabel, { color: theme.onSurfaceVariant }]}>From</Text>
              <TextInput
                style={[
                  styles.timeInput,
                  { backgroundColor: theme.surfaceVariant, color: theme.onSurface },
                  !quietEnabled && {
                    color: theme.onSurfaceVariant,
                    opacity: 0.6,
                  },
                ]}
                value={quietStart}
                onChangeText={setQuietStart}
                placeholder="22:00"
                placeholderTextColor={theme.onSurfaceVariant}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                editable={quietEnabled}
                selectTextOnFocus
              />
            </View>
            <Text style={[styles.quietSeparator, { color: theme.onSurfaceVariant }]}>—</Text>
            <View style={styles.quietField}>
              <Text style={[styles.quietFieldLabel, { color: theme.onSurfaceVariant }]}>To</Text>
              <TextInput
                style={[
                  styles.timeInput,
                  { backgroundColor: theme.surfaceVariant, color: theme.onSurface },
                  !quietEnabled && {
                    color: theme.onSurfaceVariant,
                    opacity: 0.6,
                  },
                ]}
                value={quietEnd}
                onChangeText={setQuietEnd}
                placeholder="07:00"
                placeholderTextColor={theme.onSurfaceVariant}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
                editable={quietEnabled}
                selectTextOnFocus
              />
            </View>
            <Pressable
              style={({ pressed }) => [
                styles.saveTimeBtn,
                { backgroundColor: Colors.primary500 },
                !quietEnabled && styles.saveTimeBtnDisabled,
                pressed && quietEnabled && { opacity: 0.7 },
              ]}
              onPress={handleSaveQuietHours}
              disabled={!quietEnabled}
            >
              <Text style={styles.saveTimeBtnText}>Save</Text>
            </Pressable>
          </View>
          {!quietEnabled && (
            <Text style={[styles.quietDisabledHint, { color: theme.onSurfaceVariant }]}>
              Enable nudges to configure quiet hours
            </Text>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Behaviour</Text>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
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
              onValueChange={handleUrgentOverride}
              trackColor={{ true: Colors.primary500, false: theme.outline }}
              thumbColor={Colors.white}
            />
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32 },
  description: {
    fontSize: 13,
    lineHeight: 20,
    marginBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
    marginTop: 8,
  },
  card: {
    borderWidth: 0.5,
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 20,
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
  radioSelected: { borderColor: Colors.primary500, backgroundColor: Colors.primary500 },
  optionLabel: { fontSize: 15 },
  optionLabelSelected: { fontWeight: '600' },
  quietRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  quietField: { gap: 6 },
  quietFieldLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  timeInput: {
    width: 72,
    height: 42,
    borderRadius: 12,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
  },
  quietSeparator: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 8,
  },
  saveTimeBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveTimeBtnDisabled: {
    opacity: 0.4,
  },
  saveTimeBtnText: { fontSize: 14, fontWeight: '600', color: Colors.white, letterSpacing: 0.1 },
  quietDisabledHint: {
    fontSize: 12,
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
  toggleTitle: { fontSize: 15, fontWeight: '600' },
  toggleSubtitle: { fontSize: 13, marginTop: 2 },
});
