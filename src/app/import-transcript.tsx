import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ScrollView, TextInput, Alert } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { parseSpeakerTranscript, looksLikeTranscript } from '@/services/transcript-format';
import { importTranscript } from '@/services/transcript-import';
import NotificationListener from '../../modules/notification-listener/src';

/**
 * Imports a call transcript the user shared (or pasted) from the recorder app.
 *
 * Nothing is written to the task list until the user confirms here. That matters
 * because a share carries no indication of which call it came from — guessing
 * would attribute tasks to the wrong person, and the caller label is the main
 * thing that makes a captured task recognisable later.
 */
export default function ImportTranscriptScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ text?: string }>();

  const [raw, setRaw] = useState('');
  const [caller, setCaller] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [source, setSource] = useState<'clipboard' | 'shared' | null>(null);

  // The recorder app offers no share — only "copy" behind its three-dot menu —
  // so the clipboard is the real transport, and the screen reads it on open
  // rather than making the user tap Paste after they have already tapped Copy.
  // Reading is gated on the text actually looking like a transcript, so an
  // unrelated clipboard (a URL, a phone number) is ignored rather than loaded.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (params.text) {
        setRaw(String(params.text));
        return;
      }
      // A share, if some other app ever offers one.
      try {
        const shared = await NotificationListener.consumeSharedTranscript();
        if (!cancelled && shared?.trim()) {
          setRaw(shared);
          setSource('shared');
          return;
        }
      } catch {
        /* native unavailable */
      }
      try {
        const clip = await Clipboard.getStringAsync();
        if (!cancelled && clip?.trim() && looksLikeTranscript(clip)) {
          setRaw(clip);
          setSource('clipboard');
        }
      } catch {
        /* clipboard unreadable — the manual paste button still works */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [params.text]);

  const pasteFromClipboard = useCallback((): void => {
    void (async () => {
      try {
        const text = await Clipboard.getStringAsync();
        if (!text?.trim()) {
          Alert.alert('Clipboard is empty', 'Copy the transcript in your recorder app first.');
          return;
        }
        setRaw(text);
        setSource('clipboard');
      } catch {
        Alert.alert('Could not read clipboard');
      }
    })();
  }, []);

  const parsed = raw.trim() ? parseSpeakerTranscript(raw) : null;
  const usable = raw.trim().length > 0 && looksLikeTranscript(raw);

  const doImport = (): void => {
    if (!usable || busy) return;
    setBusy(true);
    void (async () => {
      try {
        const summary = await importTranscript({
          rawText: raw,
          callerLabel: caller.trim() || null,
        });
        if (summary.error) {
          setResult(`Could not import: ${summary.error}`);
          return;
        }
        const parts: string[] = [];
        if (summary.created > 0) parts.push(`${summary.created} task(s) added`);
        if (summary.review > 0) parts.push(`${summary.review} sent to review`);
        if (summary.duplicate > 0) parts.push(`${summary.duplicate} already captured`);
        setResult(
          parts.length > 0
            ? parts.join(' · ')
            : 'No action items found in this transcript — nothing to add.'
        );
      } catch (e) {
        setResult(`Could not import: ${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setBusy(false);
      }
    })();
  };

  return (
    <Screen>
      <LargeHeader
        title="Import transcript"
        subtitle="From your recorder app"
        onBack={() => router.back()}
      />

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {raw.trim().length === 0 ? (
          <View
            style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
          >
            <Text style={[styles.h, { color: theme.onSurface }]}>Bring a transcript in</Text>
            <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
              In your Recorder app: open the call, tap{' '}
              <Text style={{ fontWeight: '700' }}>Show text</Text>, pick{' '}
              <Text style={{ fontWeight: '700' }}>Hindi</Text>, and wait for it to finish. Then the
              three-dot menu → <Text style={{ fontWeight: '700' }}>Copy</Text>.
            </Text>
            <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
              Come back here and it will pick the transcript up from your clipboard automatically.
            </Text>
            <Pressable
              onPress={pasteFromClipboard}
              style={({ pressed }) => [
                styles.btn,
                { borderColor: theme.outline },
                pressed && { opacity: 0.6 },
              ]}
              accessibilityRole="button"
            >
              <Ionicons name="clipboard-outline" size={16} color={theme.primary} />
              <Text style={[styles.btnText, { color: theme.onSurface }]}>Paste from clipboard</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
            >
              <Text style={[styles.h, { color: theme.onSurface }]}>
                {parsed?.diarised
                  ? `${parsed.turns.length} turns · ${parsed.speakerCount} speakers`
                  : `${raw.trim().split(/\s+/).length} words`}
              </Text>
              {source === 'clipboard' && (
                <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
                  Read from your clipboard.
                </Text>
              )}
              {!usable && (
                <Text style={[styles.warn, { color: '#B45309' }]}>
                  This does not look like a call transcript. Import it anyway only if you are sure.
                </Text>
              )}
              <ScrollView style={styles.preview} nestedScrollEnabled>
                <Text style={[styles.previewText, { color: theme.onSurfaceVariant }]}>
                  {(parsed?.text ?? raw).slice(0, 1500)}
                </Text>
              </ScrollView>
            </View>

            <View
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
            >
              <Text style={[styles.h, { color: theme.onSurface }]}>Who was this call with?</Text>
              <Text style={[styles.p, { color: theme.onSurfaceVariant }]}>
                Optional, but it is what makes the task recognisable in your list later.
              </Text>
              <TextInput
                value={caller}
                onChangeText={setCaller}
                placeholder="e.g. Sharma Ji"
                placeholderTextColor={theme.onSurfaceVariant}
                style={[styles.input, { color: theme.onSurface, borderColor: theme.outline }]}
                accessibilityLabel="Caller name"
              />
            </View>

            {result && (
              <View
                style={[
                  styles.card,
                  { backgroundColor: theme.surface, borderColor: theme.primary },
                ]}
              >
                <Text style={[styles.h, { color: theme.onSurface }]}>{result}</Text>
                <Pressable
                  onPress={() => router.replace('/tasks')}
                  style={({ pressed }) => [
                    styles.btn,
                    { borderColor: theme.outline },
                    pressed && { opacity: 0.6 },
                  ]}
                  accessibilityRole="button"
                >
                  <Ionicons name="list-outline" size={16} color={theme.primary} />
                  <Text style={[styles.btnText, { color: theme.onSurface }]}>Open tasks</Text>
                </Pressable>
              </View>
            )}

            {!result && (
              <Pressable
                onPress={doImport}
                disabled={busy || raw.trim().length === 0}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  { backgroundColor: theme.primary },
                  (pressed || busy) && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
              >
                <Text style={[styles.primaryBtnText, { color: theme.background }]}>
                  {busy ? 'Finding tasks…' : 'Find tasks in this call'}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => {
                setRaw('');
                setResult(null);
              }}
              style={styles.clear}
              accessibilityRole="button"
            >
              <Text style={[styles.clearText, { color: theme.onSurfaceVariant }]}>
                Clear and start over
              </Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, paddingBottom: 48, gap: 14 },
  card: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  h: { fontSize: 15, fontWeight: '700' },
  p: { fontSize: 13, lineHeight: 19 },
  warn: { fontSize: 12.5, lineHeight: 18, fontWeight: '600' },
  preview: { maxHeight: 220 },
  previewText: { fontSize: 12.5, lineHeight: 18 },
  input: { borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 10 },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 9,
    borderWidth: 1,
  },
  btnText: { fontSize: 13.5, fontWeight: '600' },
  primaryBtn: { paddingVertical: 14, borderRadius: 11, alignItems: 'center' },
  primaryBtnText: { fontSize: 15, fontWeight: '700' },
  clear: { alignItems: 'center', paddingVertical: 8 },
  clearText: { fontSize: 12.5 },
});
