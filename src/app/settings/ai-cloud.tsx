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
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { getSetting, setSetting } from '@/data/storage/settings';
import { testConnection } from '@/services/ai-classifier';
import { runDailyDigestNow } from '@/services/ai-digest';

const DEPTH = 4;

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
      }
      setAiEnabled(val);
      setSetting('ai_enabled', val);
    },
    [apiKey]
  );

  const handleKeySave = useCallback(() => {
    setSetting('ai_api_key', apiKey.trim());
    Alert.alert('Saved', 'API key saved.');
  }, [apiKey]);

  const handleModelSelect = useCallback((id: string) => {
    setModel(id);
    setSetting('ai_model', id);
  }, []);

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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Cloud AI</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Privacy disclosure */}
        <View style={[styles.disclosureCard, { borderColor: Colors.highFg }]}>
          <Text style={styles.disclosureTitle}>Data notice</Text>
          <Text style={[styles.disclosureBody, { color: theme.onSurfaceVariant }]}>
            When Cloud AI is enabled, notification text is sent to NVIDIA's inference API for
            classification. NVIDIA does not store request data beyond the call. Disable anytime to
            return to fully on-device processing.
          </Text>
        </View>

        {/* Enable toggle */}
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900 },
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
                trackColor={{ true: Colors.primary900, false: theme.outline }}
                thumbColor={Colors.white}
              />
            </View>
          </View>
        </View>

        {/* API key */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>NVIDIA API KEY</Text>
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900 },
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
                    borderColor: theme.outline,
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
              <Pressable onPress={() => setShowKey((v) => !v)} style={styles.eyeBtn}>
                <Text style={[styles.eyeText, { color: theme.onSurface }]}>
                  {showKey ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>
            <View style={styles.keyActions}>
              <Pressable
                onPress={handleKeySave}
                style={[
                  styles.btn,
                  { backgroundColor: Colors.primary900, borderColor: Colors.primary900 },
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.btnTextLight}>Save key</Text>
              </Pressable>
              <Pressable
                onPress={() => void handleTest()}
                style={[
                  styles.btn,
                  { backgroundColor: theme.surfaceVariant, borderColor: theme.outline },
                ]}
                disabled={testing}
                accessibilityRole="button"
              >
                {testing ? (
                  <ActivityIndicator size="small" color={theme.onSurface} />
                ) : (
                  <Text style={[styles.btnTextDark, { color: theme.onSurface }]}>
                    Test connection
                  </Text>
                )}
              </Pressable>
            </View>
            {testResult && (
              <View
                style={[
                  styles.testResult,
                  {
                    backgroundColor: testResult.ok ? '#E8F5E9' : '#FFF3F3',
                    borderColor: testResult.ok ? Colors.success : Colors.urgentFg,
                  },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '700',
                    color: testResult.ok ? Colors.success : Colors.urgentFg,
                  }}
                >
                  {testResult.ok ? '✓ ' : '✗ '}
                  {testResult.msg}
                </Text>
              </View>
            )}
          </View>
        </View>

        {/* Model picker */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>MODEL</Text>
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900, padding: 0 },
            ]}
          >
            {NVIDIA_MODELS.map((m, i) => (
              <Pressable
                key={m.id}
                onPress={() => handleModelSelect(m.id)}
                style={[
                  styles.modelRow,
                  i > 0 && { borderTopWidth: 1, borderTopColor: theme.outline },
                  model === m.id && { backgroundColor: theme.surfaceVariant },
                ]}
                accessibilityRole="radio"
                accessibilityState={{ selected: model === m.id }}
              >
                <View style={[styles.radioCircle, { borderColor: Colors.primary900 }]}>
                  {model === m.id && (
                    <View style={[styles.radioDot, { backgroundColor: Colors.primary900 }]} />
                  )}
                </View>
                <Text style={[styles.modelLabel, { color: theme.onSurface }]}>{m.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Daily digest */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>DAILY DIGEST</Text>
        <View style={[styles.sectionWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.sectionShadow} />
          <View
            style={[
              styles.sectionCard,
              { backgroundColor: theme.surface, borderColor: Colors.primary900 },
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
                trackColor={{ true: Colors.primary900, false: theme.outline }}
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
                      borderColor: theme.outline,
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
                <Pressable
                  onPress={handleDigestTimeSave}
                  style={[styles.saveBtn, { backgroundColor: Colors.primary900 }]}
                  accessibilityRole="button"
                >
                  <Text style={styles.btnTextLight}>Save</Text>
                </Pressable>
              </View>
            )}
            <Pressable
              onPress={() => void handleRunDigestNow()}
              style={[
                styles.btn,
                {
                  backgroundColor: theme.surfaceVariant,
                  borderColor: theme.outline,
                  marginTop: 12,
                },
              ]}
              disabled={digestRunning}
              accessibilityRole="button"
            >
              {digestRunning ? (
                <ActivityIndicator size="small" color={theme.onSurface} />
              ) : (
                <Text style={[styles.btnTextDark, { color: theme.onSurface }]}>
                  Send digest now
                </Text>
              )}
            </Pressable>
          </View>
        </View>

        <Text style={[styles.footnote, { color: theme.onSurfaceVariant }]}>
          When Cloud AI is disabled, TaskMind uses its fully on-device rule engine and local intent
          model — no network calls, no data shared.
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
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
  content: { padding: 16, paddingBottom: 48, gap: 8 },

  disclosureCard: {
    borderWidth: 1.5,
    borderRadius: 2,
    padding: 12,
    marginBottom: 8,
    backgroundColor: '#FFFBF0',
  },
  disclosureTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.highFg,
    marginBottom: 4,
    letterSpacing: 0.5,
  },
  disclosureBody: { fontSize: 12, lineHeight: 18 },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 6,
    marginTop: 8,
  },
  sectionWrapper: { position: 'relative' },
  sectionShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  sectionCard: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 14,
  },

  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { flex: 1, marginRight: 12 },
  rowLabel: { fontSize: 15, fontWeight: '700' },
  rowSub: { fontSize: 12, marginTop: 2 },

  hint: { fontSize: 12, marginBottom: 10 },

  keyRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  keyInput: {
    flex: 1,
    borderWidth: 1.5,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    fontFamily: 'monospace',
  },
  eyeBtn: { paddingHorizontal: 8, paddingVertical: 8 },
  eyeText: { fontSize: 12, fontWeight: '700' },
  keyActions: { flexDirection: 'row', gap: 8, marginTop: 10 },

  btn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 2,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
    minHeight: 38,
  },
  btnTextLight: { fontSize: 13, fontWeight: '700', color: Colors.white },
  btnTextDark: { fontSize: 13, fontWeight: '700' },

  testResult: {
    marginTop: 10,
    borderWidth: 1.5,
    borderRadius: 2,
    padding: 8,
  },

  modelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  radioCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioDot: { width: 8, height: 8, borderRadius: 4 },
  modelLabel: { fontSize: 13, fontWeight: '600', flex: 1 },

  timeRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  timeInput: {
    borderWidth: 1.5,
    borderRadius: 2,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    fontWeight: '700',
    width: 72,
    textAlign: 'center',
  },
  saveBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 2,
  },

  footnote: { fontSize: 12, lineHeight: 18, marginTop: 8, paddingHorizontal: 4 },
});
