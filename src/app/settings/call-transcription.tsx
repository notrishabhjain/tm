import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';

const TERMUX_SETUP_SCRIPT = `pkg update -y
pkg install -y clang cmake git ffmpeg python
git clone https://github.com/ggerganov/whisper.cpp ~/whisper.cpp
cd ~/whisper.cpp
cmake -B build -DWHISPER_BUILD_EXAMPLES=ON
cmake --build build -j$(nproc)
bash models/download-ggml-model.sh base.en
echo "✓ whisper.cpp ready"`;

const TRANSCRIBE_SCRIPT = `#!/data/data/com.termux/files/usr/bin/bash
# transcribe_call.sh — paste this into ~/transcribe_call.sh
set -e
RECORDING="$1"
[ -z "$RECORDING" ] && { echo "Usage: $0 <recording_file>"; exit 1; }

WAV="/data/data/com.termux/files/home/taskmind_tmp.wav"
OUT_TXT="/sdcard/Download/taskmind_transcript.txt"

ffmpeg -i "$RECORDING" -ar 16000 -ac 1 "$WAV" -y -loglevel error
~/whisper.cpp/build/bin/whisper-cli -m ~/whisper.cpp/models/ggml-base.en.bin \\
  -f "$WAV" -otxt -of /data/data/com.termux/files/home/taskmind_tmp 2>/dev/null
mv /data/data/com.termux/files/home/taskmind_tmp.txt "$OUT_TXT"

ENC=$(python3 -c "import urllib.parse,sys; print(urllib.parse.quote(sys.argv[1]))" "$OUT_TXT")
am start -a android.intent.action.VIEW -d "taskmind://call-transcript?path=$ENC" >/dev/null 2>&1 || true
rm -f "$WAV"`;

function CodeBlock({ code, label }: { code: string; label: string }): React.JSX.Element {
  const theme = useTheme();
  const [copied, setCopied] = useState(false);

  const copy = async (): Promise<void> => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={[styles.codeCard, { backgroundColor: '#0A2540', borderColor: theme.outline }]}>
      <View style={styles.codeHeader}>
        <Text style={styles.codeLabel}>{label}</Text>
        <Pressable onPress={() => void copy()} style={styles.copyBtn}>
          <Text style={styles.copyText}>{copied ? '✓ Copied' : 'Copy'}</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <Text style={styles.codeText}>{code}</Text>
      </ScrollView>
    </View>
  );
}

export default function CallTranscriptionScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  const openTermux = (): void => {
    void Linking.openURL('https://f-droid.org/en/packages/com.termux/').catch(() => {
      Alert.alert('Open F-Droid', 'Search for "Termux" on F-Droid to install it.');
    });
  };

  const openMacroDroid = (): void => {
    void Linking.openURL('market://details?id=com.arlosoft.macrodroid').catch(() => {
      Alert.alert('Open Play Store', 'Search for "MacroDroid" on Google Play.');
    });
  };

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.background }]}
      contentContainerStyle={styles.content}
    >
      <Pressable style={styles.backRow} onPress={() => router.back()}>
        <Text style={[styles.back, { color: theme.primary }]}>‹ Settings</Text>
      </Pressable>

      <Text style={[styles.title, { color: theme.onSurface }]}>Call Transcription Setup</Text>
      <Text style={[styles.intro, { color: theme.onSurfaceVariant }]}>
        Automatically extract tasks from call recordings using on-device AI (whisper.cpp). Setup
        takes about 20 minutes and only needs to be done once.
      </Text>

      {/* Prerequisites */}
      <Section title="Prerequisites" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          Your device must have call recording enabled (check your Phone app settings). You also
          need two apps:
        </Text>
        <View style={styles.appRow}>
          <Pressable style={[styles.appBtn, { borderColor: theme.outline }]} onPress={openTermux}>
            <Text style={[styles.appBtnText, { color: theme.primary }]}>Install Termux ↗</Text>
            <Text style={[styles.appBtnSub, { color: theme.onSurfaceVariant }]}>
              From F-Droid (not Play Store)
            </Text>
          </Pressable>
          <Pressable
            style={[styles.appBtn, { borderColor: theme.outline }]}
            onPress={openMacroDroid}
          >
            <Text style={[styles.appBtnText, { color: theme.primary }]}>Install MacroDroid ↗</Text>
            <Text style={[styles.appBtnSub, { color: theme.onSurfaceVariant }]}>
              From Google Play
            </Text>
          </Pressable>
        </View>
      </Section>

      {/* Step 1 */}
      <Section title="Step 1 — Build whisper.cpp in Termux" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          Open Termux and paste this script. It installs dependencies, clones whisper.cpp, compiles
          it, and downloads the base English model (~75 MB). Takes ~15 min.
        </Text>
        <CodeBlock code={TERMUX_SETUP_SCRIPT} label="Termux setup (run once)" />
      </Section>

      {/* Step 2 */}
      <Section title="Step 2 — Create the transcription script" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          In Termux, create the script file:{'\n'}
          <Text style={styles.mono}>nano ~/transcribe_call.sh</Text>
          {'\n'}Paste the content below, save with Ctrl+X → Y → Enter, then make it executable:
          {'\n'}
          <Text style={styles.mono}>chmod +x ~/transcribe_call.sh</Text>
        </Text>
        <CodeBlock code={TRANSCRIBE_SCRIPT} label="~/transcribe_call.sh" />
      </Section>

      {/* Step 3 */}
      <Section title="Step 3 — Configure MacroDroid" theme={theme}>
        <StepRow num="1" theme={theme}>
          Open MacroDroid → tap <Text style={styles.bold}>+</Text> to create a new macro
        </StepRow>
        <StepRow num="2" theme={theme}>
          <Text style={styles.bold}>Trigger</Text>: File Event → File Created → choose your call
          recordings folder (usually <Text style={styles.mono}>/sdcard/Recordings/Calls/</Text> or{' '}
          <Text style={styles.mono}>/sdcard/MIUI/sounds/</Text> — check your Phone app settings for
          exact path)
        </StepRow>
        <StepRow num="3" theme={theme}>
          <Text style={styles.bold}>Action</Text>: Termux → Run Command → Command:{' '}
          <Text style={styles.mono}>bash ~/transcribe_call.sh [trigger_file_path]</Text>
          {'\n'}(MacroDroid inserts the actual file path at runtime)
        </StepRow>
        <StepRow num="4" theme={theme}>
          Enable the macro. After your next call, TaskMind will open automatically with extracted
          tasks.
        </StepRow>
      </Section>

      {/* Tips */}
      <Section title="Tips & Troubleshooting" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Battery optimisation</Text>: exclude both Termux and MacroDroid
          from battery saver (Settings → Battery → App battery usage).
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Cloud AI required</Text>: transcript analysis uses the NVIDIA
          API configured in Settings → Intelligence → Cloud AI. Make sure it is enabled.
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Model quality</Text>: the base.en model works well for clear
          audio. For noisy calls, replace <Text style={styles.mono}>ggml-base.en.bin</Text> with{' '}
          <Text style={styles.mono}>ggml-small.en.bin</Text> (slower, more accurate).
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Test manually</Text>: in Termux, run{' '}
          <Text style={styles.mono}>bash ~/transcribe_call.sh /path/to/recording.m4a</Text> to
          verify the pipeline works before relying on MacroDroid.
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
  theme,
}: {
  title: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
      <Text style={[styles.sectionTitle, { color: theme.primary }]}>{title}</Text>
      {children}
    </View>
  );
}

function StepRow({
  num,
  children,
  theme,
}: {
  num: string;
  children: React.ReactNode;
  theme: ReturnType<typeof useTheme>;
}): React.JSX.Element {
  return (
    <View style={styles.stepRow}>
      <View style={styles.stepNum}>
        <Text style={styles.stepNumText}>{num}</Text>
      </View>
      <Text style={[styles.stepText, { color: theme.onSurface }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 48, gap: 16 },
  backRow: { marginBottom: 4 },
  back: { fontSize: 16, fontWeight: '600' },
  title: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  intro: { fontSize: 14, lineHeight: 22 },
  section: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 16,
    gap: 12,
  },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  body: { fontSize: 14, lineHeight: 22 },
  bold: { fontWeight: '700' },
  mono: { fontFamily: 'monospace', fontSize: 12 },
  appRow: { flexDirection: 'row', gap: 10 },
  appBtn: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 2,
    padding: 12,
    alignItems: 'center',
    gap: 4,
  },
  appBtnText: { fontSize: 13, fontWeight: '700' },
  appBtnSub: { fontSize: 11 },
  codeCard: {
    borderWidth: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  codeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  codeLabel: { fontSize: 11, color: '#7DD3FC', fontWeight: '600' },
  copyBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  copyText: { fontSize: 12, color: Colors.success, fontWeight: '600' },
  codeText: {
    fontFamily: 'monospace',
    fontSize: 12,
    color: '#E2E8F0',
    padding: 12,
    lineHeight: 20,
  },
  stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  stepNum: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.primary900,
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  stepText: { flex: 1, fontSize: 14, lineHeight: 22 },
});
