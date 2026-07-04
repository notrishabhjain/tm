import React, { useState, useCallback } from 'react';
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
import { Button } from '@/ui/components/Button';
import { getSetting, setSetting } from '@/data/storage/settings';
import { testConnection } from '@/services/ai-classifier';
import { runDailyDigestNow } from '@/services/ai-digest';
import NotificationListener from '../../../modules/notification-listener/src';

// Mirror the Cloud-AI credentials into native SharedPreferences so the
// background call pipeline (CallTranscriptionService) can use them while the
// JS process is dead.
function mirrorAiCredentials(key: string, model: string): void {
  void NotificationListener.setAiCredentials(key, model).catch(() => {});
}

const NVIDIA_MODELS = [
  { id: 'meta/llama-3.1-8b-instruct', label: 'Llama 3.1 8B (fast, default)' },
  { id: 'meta/llama-3.3-70b-instruct', label: 'Llama 3.3 70B (best quality)' },
  { id: 'mistralai/mistral-7b-instruct-v0.3', label: 'Mistral 7B' },
  { id: 'nvidia/llama-3.1-nemotron-nano-8b-v1', label: 'Nemotron Nano 8B' },
] as const;

function isValidTime(t: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(t.trim());
}

export default function AiCloudScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  const [aiEnabled, setAiEnabled] = useState(getSetting('ai_enabled'));
  const [apiKey, setApiKey] = useState(getSetting('ai_api_key'));
  const [showKey, setShowKey] = useState(false);
  const [model, setModel] = useState(getSetting('ai_model'));
  const [digestEnabled, setDigestEnabled] = useState(getSetting('ai_digest_enabled'));
  const [digestTime, setDigestTime] = useState(getSetting('ai_digest_time'));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [digestRunning, setDigestRunning] = useState(false);

  const handleAiToggle = useCallback(
    (val: boolean) => {
      const trimmedKey = apiKey.trim();
      if (val && !trimmedKey) {
        Alert.alert('API key required', 'Enter your NVIDIA API key before enabling Cloud AI.');
        return;
      }
      // Persist the key at the same time as enabling so the notification handler
      // can read it — don't require a separate "Save key" tap before toggling on.
      if (val && trimmedKey) {
        setSetting('ai_api_key', trimmedKey);
        mirrorAiCredentials(trimmedKey, model);
      }
      setAiEnabled(val);
      setSetting('ai_enabled', val);
    },
    [apiKey, model]
  );

  const handleKeySave = useCallback(() => {
    setSetting('ai_api_key', apiKey.trim());
    mirrorAiCredentials(apiKey.trim(), model);
    Alert.alert('Saved', 'API key saved.');
  }, [apiKey, model]);

  const handleModelSelect = useCallback(
    (id: string) => {
      setModel(id);
      setSetting('ai_model', id);
      mirrorAiCredentials(apiKey.trim(), id);
    },
    [apiKey]
  );

  const handleDigestToggle = useCallback((val: boolean) => {
    setDigestEnabled(val);
    setSetting('ai_digest_enabled', val);
  }, []);

  const handleDigestTimeSave = useCallback(() => {
    if (!isValidTime(digestTime)) {
      Alert.alert('Invalid time', 'Enter time as HH:MM (e.g. 09:00).');
      return;
    }
    setSetting('ai_digest_time', digestTime.trim());
    setSetting('ai_last_digest_date', ''); // reset so it runs at new time
    Alert.alert('Saved', `Daily digest will run at ${digestTime.trim()}.`);
  }, [digestTime]);

  const handleRunDigestNow = useCallback(async () => {
    setDigestRunning(true);
    const result = await runDailyDigestNow();
    setDigestRunning(false);
    Alert.alert(
      result.sent ? 'Digest sent' : 'Could not send',
      result.sent ? 'Check your notifications.' : (result.error ?? 'Unknown error')
    );
  }, []);

  const handleTest = useCallback(async () => {
    const key = apiKey.trim();
    if (!key) {
      Alert.alert('No API key', 'Enter your NVIDIA API key first.');
      return;
    }
    setSetting('ai_api_key', key); // persist so the notification handler can read it
    mirrorAiCredentials(key, model);
    setTesting(true);
    setTestResult(null);
    const result = await testConnection(key, model);
    setTesting(false);
    setTestResult({
      ok: result.ok,
      msg: result.ok ? 'Connected successfully.' : (result.error ?? 'Connection failed.'),
    });
  }, [apiKey, model]);

  return (
    <Screen>
      <LargeHeader title="Cloud AI" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Privacy disclosure */}
        <View
          style={[
            styles.disclosureCard,
            { backgroundColor: theme.surfaceVariant, borderColor: theme.outline },
          ]}
        >
          <Text style={[styles.disclosureTitle, { color: theme.onSurface }]}>Data notice</Text>
          <Text style={[styles.disclosureBody, { color: theme.onSurfaceVariant }]}>
            When Cloud AI is enabled, notification text is sent to NVIDIA's inference API for
            classification. NVIDIA does not store request data beyond the call. Disable anytime to
            return to fully on-device processing.
          </Text>
        </View>

        {/* Enable toggle */}
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.onSurface }]}>Enable Cloud AI</Text>
              <Text style={[styles.rowSub, { color: theme.onSurfaceVariant }]}>
                {aiEnabled ? 'AI classifies all notifications' : 'On-device only'}
              </Text>
            </View>
            <Switch
              value={aiEnabled}
              onValueChange={handleAiToggle}
              trackColor={{ true: Colors.primary500, false: theme.outline }}
              thumbColor={Colors.white}
            />
          </View>
        </View>

        {/* API key */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>NVIDIA API key</Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        >
          <Text style={[styles.hint, { color: theme.onSurfaceVariant }]}>
            Get a free key at build.nvidia.com → API Keys
          </Text>
          <View style={styles.keyRow}>
            <TextInput
              style={[
                styles.keyInput,
                {
                  color: theme.onSurface,
                  backgroundColor: theme.surfaceVariant,
                },
              ]}
              value={apiKey}
              onChangeText={setApiKey}
              placeholder="nvapi-…"
              placeholderTextColor={theme.onSurfaceVariant}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable
              onPress={() => setShowKey((v) => !v)}
              style={({ pressed }) => [styles.eyeBtn, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.eyeText, { color: theme.primary }]}>
                {showKey ? 'Hide' : 'Show'}
              </Text>
            </Pressable>
          </View>
          <View style={styles.keyActions}>
            <Button label="Save key" onPress={handleKeySave} style={styles.keyActionBtn} />
            <Button
              variant="secondary"
              label="Test connection"
              loading={testing}
              onPress={() => void handleTest()}
              style={styles.keyActionBtn}
            />
          </View>
          {testResult && (
            <View
              style={[
                styles.testResult,
                {
                  backgroundColor: testResult.ok ? Colors.successBg : Colors.urgentBgLight,
                },
              ]}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: testResult.ok ? Colors.success : Colors.urgentFg,
                }}
              >
                {testResult.ok ? '✓ ' : '✗ '}
                {testResult.msg}
              </Text>
            </View>
          )}
        </View>

        {/* Model picker */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Model</Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline, padding: 0 },
          ]}
        >
          {NVIDIA_MODELS.map((m, i) => (
            <Pressable
              key={m.id}
              onPress={() => handleModelSelect(m.id)}
              style={({ pressed }) => [
                styles.modelRow,
                i > 0 && { borderTopWidth: 0.5, borderTopColor: theme.outline },
                model === m.id && { backgroundColor: theme.surfaceVariant },
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="radio"
              accessibilityState={{ selected: model === m.id }}
            >
              <View style={[styles.radioCircle, { borderColor: theme.primary }]}>
                {model === m.id && (
                  <View style={[styles.radioDot, { backgroundColor: theme.primary }]} />
                )}
              </View>
              <Text style={[styles.modelLabel, { color: theme.onSurface }]}>{m.label}</Text>
            </Pressable>
          ))}
        </View>

        {/* Daily digest */}
        <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>Daily digest</Text>
        <View
          style={[
            styles.sectionCard,
            { backgroundColor: theme.surface, borderColor: theme.outline },
          ]}
        >
          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={[styles.rowLabel, { color: theme.onSurface }]}>Morning briefing</Text>
              <Text style={[styles.rowSub, { color: theme.onSurfaceVariant }]}>
                AI summary of your pending tasks each morning
              </Text>
            </View>
            <Switch
              value={digestEnabled}
              onValueChange={handleDigestToggle}
              trackColor={{ true: Colors.primary500, false: theme.outline }}
              thumbColor={Colors.white}
            />
          </View>
          {digestEnabled && (
            <View style={styles.timeRow}>
              <Text style={[styles.rowLabel, { color: theme.onSurface, flex: 1 }]}>
                Digest time
              </Text>
              <TextInput
                style={[
                  styles.timeInput,
                  {
                    color: theme.onSurface,
                    backgroundColor: theme.surfaceVariant,
                  },
                ]}
                value={digestTime}
                onChangeText={setDigestTime}
                placeholder="09:00"
                placeholderTextColor={theme.onSurfaceVariant}
                keyboardType="numbers-and-punctuation"
                maxLength={5}
              />
              <Button label="Save" onPress={handleDigestTimeSave} style={styles.timeSaveBtn} />
            </View>
          )}
          <Button
            variant="secondary"
            label="Send digest now"
            loading={digestRunning}
            onPress={() => void handleRunDigestNow()}
            style={styles.digestNowBtn}
          />
        </View>

        <Text style={[styles.footnote, { color: theme.onSurfaceVariant }]}>
          When Cloud AI is disabled, TaskMind uses its fully on-device rule engine and local intent
          model — no network calls, no data shared.
        </Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48, gap: 8 },

  disclosureCard: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
    marginBottom: 8,
  },
  disclosureTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  disclosureBody: { fontSize: 12, lineHeight: 18 },

  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: 8,
  },
  sectionCard: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },

  hint: { fontSize: 12, marginBottom: 10 },

  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keyInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  eyeBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  eyeText: { fontSize: 12, fontWeight: '600' },
  keyActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  keyActionBtn: { flex: 1, height: 44 },

  testResult: {
    marginTop: 10,
    borderRadius: 12,
    padding: 10,
  },

  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 10,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  modelLabel: { fontSize: 14, fontWeight: '500', flex: 1 },

  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  timeInput: {
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    fontWeight: '600',
    width: 72,
    textAlign: 'center',
  },
  timeSaveBtn: { height: 44, paddingHorizontal: 18 },
  digestNowBtn: { height: 44, marginTop: 12 },

  footnote: { fontSize: 12, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
});
