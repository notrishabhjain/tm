import React, { useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';

const TERMUX_SETUP_SCRIPT = `pkg update -y
pkg install -y clang cmake git ffmpeg python termux-api
termux-setup-storage
git clone https://github.com/ggerganov/whisper.cpp ~/whisper.cpp
cd ~/whisper.cpp
cmake -B build -DWHISPER_BUILD_EXAMPLES=ON
cmake --build build -j$(nproc)
bash models/download-ggml-model.sh base
mkdir -p ~/.termux
echo "allow-external-apps=true" >> ~/.termux/termux.properties
termux-reload-settings
grep -qF "termux-wake-lock" ~/.bashrc || echo "termux-wake-lock" >> ~/.bashrc
echo "✓ Setup complete — close Termux fully, then reopen it once to activate the background service. After that, MacroDroid can reach Termux even when it is not visible on screen."`;

const TRANSCRIBE_SCRIPT = `#!/data/data/com.termux/files/usr/bin/bash
# transcribe_call.sh — paste into ~/transcribe_call.sh, then: chmod +x ~/transcribe_call.sh
#
# Finds the newest call recording, transcribes it on-device with whisper.cpp,
# then hands the transcript straight to TaskMind via the same share-intent
# mechanism used for "Share to TaskMind" from WhatsApp — no files for the app
# to read back, so no scoped-storage permission issues.
set -e

# Folder where your phone saves call recordings — verify with a file manager
# and edit this path if your device uses a different one (e.g. some OEMs use
# /storage/emulated/0/Recordings/Call/ or /storage/emulated/0/MIUI/sounds/).
REC_DIR="/storage/emulated/0/Recordings/Record/Call"
STATE_FILE="$HOME/.taskmind_last_call"
WAV="$HOME/taskmind_tmp.wav"
TXT_BASE="$HOME/taskmind_tmp"

# 1. Find the newest recording
LATEST=$(ls -t "$REC_DIR"/*.m4a "$REC_DIR"/*.M4A 2>/dev/null | head -n 1)
[ -z "$LATEST" ] && { echo "No recordings found in $REC_DIR — check REC_DIR is correct"; exit 0; }

# 2. Skip if we already handed off this exact file (MacroDroid can fire more than once)
[ "$(cat "$STATE_FILE" 2>/dev/null)" = "$LATEST" ] && { echo "Already processed: $LATEST"; exit 0; }

# 3. Ignore stale matches — only act on a recording from the last 5 minutes
MTIME=$(stat -c %Y "$LATEST")
AGE=$(( $(date +%s) - MTIME ))
[ "$AGE" -gt 300 ] && { echo "Newest recording is \${AGE}s old — not from this call, skipping"; exit 0; }

# 4. Pull the caller's number out of the filename (e.g. "+919876543210_20260607_1545.m4a")
CALLER=$(basename "$LATEST" | grep -oE '\\+?[0-9]{6,15}' | head -n 1)
[ -z "$CALLER" ] && CALLER="Unknown"

# 5. Convert to 16 kHz mono WAV and transcribe on-device
ffmpeg -i "$LATEST" -ar 16000 -ac 1 "$WAV" -y -loglevel error
~/whisper.cpp/build/bin/whisper-cli -m ~/whisper.cpp/models/ggml-base.bin \\
  -f "$WAV" -otxt -of "$TXT_BASE" -l auto -bs 1 -bo 1 2>/dev/null
TRANSCRIPT=$(cat "$TXT_BASE.txt" 2>/dev/null || echo "")

if [ -n "$TRANSCRIPT" ]; then
  # 6. Hand off to TaskMind — tagged so the app knows it's a call transcript,
  #    not a regular share, and can resolve "tomorrow" etc. against the call time.
  EPOCH_MS=$(( MTIME * 1000 ))
  am start -a android.intent.action.SEND -t text/plain \\
    --es android.intent.extra.SUBJECT "TASKMIND_CALL_TRANSCRIPT|$EPOCH_MS|$CALLER" \\
    --es android.intent.extra.TEXT "$TRANSCRIPT" \\
    -n com.taskmind.app/.MainActivity >/dev/null 2>&1 || true
fi

# 7. Remember this file (skip it next run) and clean up temp files
echo "$LATEST" > "$STATE_FILE"
rm -f "$WAV" "$TXT_BASE.txt"`;

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
        Turn your recorded calls into tasks automatically: when a call ends, MacroDroid runs a
        Termux script that transcribes the recording on-device with whisper.cpp and sends the
        transcript straight to TaskMind, where AI extracts action items with correct dates. Setup
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
          Open Termux and paste this script. It installs dependencies, grants Termux access to
          shared storage (accept the permission prompt), clones and compiles whisper.cpp, downloads
          the base English model (~75 MB), and enables external apps (needed for MacroDroid to
          trigger Termux in Step 3). Takes ~15 min.
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
          {'\n\n'}
          <Text style={styles.bold}>Important:</Text> open the script and check that{' '}
          <Text style={styles.mono}>REC_DIR</Text> matches where your phone actually saves call
          recordings — browse to it with a file manager first (you mentioned a path like{' '}
          <Text style={styles.mono}>Recordings/Record/Call</Text>; some OEMs use{' '}
          <Text style={styles.mono}>Recordings/Call</Text> or{' '}
          <Text style={styles.mono}>MIUI/sounds/Call</Text> instead).
        </Text>
        <CodeBlock code={TRANSCRIBE_SCRIPT} label="~/transcribe_call.sh" />
      </Section>

      {/* Step 3 */}
      <Section title="Step 3 — Configure MacroDroid" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          MacroDroid has no "file created" trigger, so the macro instead fires when the call ends
          and waits for the recording to finish saving before handing off to Termux.
        </Text>
        <StepRow num="1" theme={theme}>
          Open MacroDroid → tap <Text style={styles.bold}>+</Text> to create a new macro
        </StepRow>
        <StepRow num="2" theme={theme}>
          <Text style={styles.bold}>Trigger</Text>: Phone →{' '}
          <Text style={styles.bold}>Call Ended</Text> (any number)
        </StepRow>
        <StepRow num="3" theme={theme}>
          <Text style={styles.bold}>Action 1</Text>: Logic / Control → Wait → Wait Before Next
          Action: <Text style={styles.bold}>15 seconds</Text> (gives the Phone app time to finish
          writing the recording file)
        </StepRow>
        <StepRow num="4" theme={theme}>
          <Text style={styles.bold}>Action 2</Text>: Connections → Send Intent → fill in:
          {'\n'}• Action: <Text style={styles.mono}>com.termux.RUN_COMMAND</Text>
          {'\n'}• Package: <Text style={styles.mono}>com.termux</Text>
          {'\n'}• Target Class: <Text style={styles.mono}>com.termux.app.RunCommandService</Text>
          {'\n'}• Target: <Text style={styles.bold}>Service</Text> (not Activity/Broadcast)
          {'\n'}• Extra 1 — name <Text style={styles.mono}>com.termux.RUN_COMMAND_PATH</Text>, value{' '}
          <Text style={styles.mono}>/data/data/com.termux/files/home/transcribe_call.sh</Text>
          {'\n'}• Extra 2 — name <Text style={styles.mono}>com.termux.RUN_COMMAND_BACKGROUND</Text>,
          value <Text style={styles.mono}>true</Text>
        </StepRow>
        <StepRow num="5" theme={theme}>
          Save and enable the macro. After your next call (and the 15 s wait), TaskMind opens
          automatically with the extracted tasks ready to review.
        </StepRow>
      </Section>

      {/* Tips */}
      <Section title="Tips & Troubleshooting" theme={theme}>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>"app is in background" / Send Intent fails</Text>: this means
          Termux's background service was killed. The setup script already adds{' '}
          <Text style={styles.mono}>termux-wake-lock</Text> to your Termux startup so it keeps the
          service alive automatically — but you must open Termux at least once after each phone
          reboot to activate it. After opening it, you can close it immediately; the service stays
          running. You should also go to Settings → Apps → Termux → Battery → set to{' '}
          <Text style={styles.bold}>Unrestricted</Text>, and do the same for MacroDroid.
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Wrong recordings folder</Text>: if nothing happens, open Termux
          and run <Text style={styles.mono}>ls /storage/emulated/0/Recordings/Record/Call</Text> —
          if that errors, find the real folder with a file manager and update{' '}
          <Text style={styles.mono}>REC_DIR</Text> in the script.
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Battery optimisation</Text>: set both Termux and MacroDroid to
          Unrestricted in Settings → Apps → [app] → Battery. This prevents Android from killing
          Termux mid-transcription and stops MacroDroid from being delayed by power saving.
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Cloud AI required</Text>: transcript analysis uses the NVIDIA
          API configured in Settings → Intelligence → Cloud AI. Make sure it is enabled.
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Non-English calls</Text>: the setup uses the multilingual{' '}
          <Text style={styles.mono}>base</Text> model which supports Hindi, English, and 97 other
          languages — it auto-detects the spoken language. If transcription is inaccurate, you can
          pin the language by changing <Text style={styles.mono}>-l auto</Text> to a language code
          (e.g. <Text style={styles.mono}>-l hi</Text> for Hindi,{' '}
          <Text style={styles.mono}>-l en</Text> for English) in the transcription script.
        </Text>
        <Text style={[styles.body, { color: theme.onSurface }]}>
          {'• '}
          <Text style={styles.bold}>Test manually</Text>: in Termux, run{' '}
          <Text style={styles.mono}>bash ~/transcribe_call.sh</Text> right after a call to verify
          the whole pipeline — including the hand-off to TaskMind — before relying on MacroDroid. To
          force it to re-process the same recording, run{' '}
          <Text style={styles.mono}>rm ~/.taskmind_last_call</Text> first.
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
