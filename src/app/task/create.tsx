import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Ionicons } from '@expo/vector-icons';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import { analyzeQuickText } from '@/services/quick-extract';
import NotificationListener from '../../../modules/notification-listener/src';
import type { Priority } from '@/domain/types';

const taskRepo = new TaskRepository(db);

type VoiceState = 'idle' | 'recording' | 'transcribing';

const PRIORITIES: Array<{ value: Priority; label: string; desc: string }> = [
  { value: 'URGENT', label: 'Urgent', desc: 'Needs immediate attention' },
  { value: 'HIGH', label: 'High', desc: 'Important, act soon' },
  { value: 'MEDIUM', label: 'Medium', desc: 'Standard priority' },
  { value: 'LOW', label: 'Low', desc: 'When time permits' },
];

export default function CreateTaskScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  // Tracks whether the user manually chose a priority — extraction must not
  // override an explicit choice.
  const [priorityTouched, setPriorityTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [voiceState, setVoiceState] = useState<VoiceState>('idle');
  const [recordSecs, setRecordSecs] = useState(0);
  const inputRef = useRef<TextInput>(null);
  const theme = useTheme();

  // Recording timer
  useEffect(() => {
    if (voiceState !== 'recording') {
      setRecordSecs(0);
      return;
    }
    const t = setInterval(() => setRecordSecs((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [voiceState]);

  // Stop any dangling recording when leaving the screen
  useEffect(() => {
    return () => {
      void NotificationListener.cancelVoiceCapture().catch(() => {});
    };
  }, []);

  // Voice capture: record with the mic, transcribe with the SAME Whisper ASR
  // used for call recordings (free NVIDIA API, handles Hindi/English/Hinglish),
  // then drop the text into the input for the extraction pipeline on save.
  const handleMicPress = async (): Promise<void> => {
    if (voiceState === 'transcribing') return;

    if (voiceState === 'recording') {
      setVoiceState('transcribing');
      try {
        const path = await NotificationListener.stopVoiceCapture();
        if (!path) {
          Alert.alert('Nothing recorded', 'The recording was too short. Try again.');
          setVoiceState('idle');
          return;
        }
        const result = await NotificationListener.transcribeFile(path);
        if (result.ok && result.text) {
          setTitle((prev) => (prev.trim() ? `${prev.trim()} ${result.text}` : (result.text ?? '')));
        } else {
          Alert.alert(
            'Transcription failed',
            result.error ?? 'Could not transcribe. Check your internet connection and try again.'
          );
        }
      } finally {
        setVoiceState('idle');
      }
      return;
    }

    // idle → start recording (ask mic permission first)
    const perm = await NotificationListener.requestMicPermission().catch(() => ({
      granted: false,
    }));
    // Expo permissions manager resolves with {granted} or {status:'granted'}
    const granted =
      (perm as { granted?: boolean; status?: string }).granted === true ||
      (perm as { status?: string }).status === 'granted';
    if (!granted) {
      Alert.alert('Microphone needed', 'Allow microphone access to dictate tasks.');
      return;
    }
    const started = await NotificationListener.startVoiceCapture();
    if (!started) {
      Alert.alert('Could not start recording', 'The microphone may be in use by another app.');
      return;
    }
    setVoiceState('recording');
  };

  const handleCreate = async (): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Title required', 'Please enter a task description.');
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      // Rule-engine pass over the (possibly dictated) text: derives a cleaned
      // imperative title, priority, and due date — same pipeline the share
      // screen uses. Manual priority choice always wins.
      const extracted = await analyzeQuickText(trimmed);
      const finalTitle = extracted.title || trimmed;
      const finalPriority = priorityTouched ? priority : extracted.priority;
      await taskRepo.createTask({
        title: finalTitle,
        body: extracted.title && extracted.title !== trimmed ? trimmed : undefined,
        sourceApp: 'manual',
        priority: finalPriority,
        confidence: 1.0,
        needsConfirmation: false,
        matchedKeywords: ['manual_entry'],
        language: 'EN',
        dueDate: extracted.dueDate,
      });
      void queryClient.invalidateQueries({ queryKey: ['tasks'] });
      router.back();
    } catch (err) {
      Alert.alert('Error', String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Screen>
      <KeyboardAvoidingView
        style={styles.root}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <LargeHeader title="New Task" onBack={() => router.back()} />

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {/* Title input */}
          <Text style={[styles.label, { color: theme.onSurfaceVariant }]}>
            What needs to be done
          </Text>
          <TextInput
            ref={inputRef}
            style={[
              styles.titleInput,
              { backgroundColor: theme.surfaceVariant, color: theme.onSurface },
            ]}
            value={title}
            onChangeText={setTitle}
            placeholder="Type or dictate the task… e.g. 'Send invoice to Rahul kal tak'"
            placeholderTextColor={theme.onSurfaceVariant}
            multiline
            autoFocus
            returnKeyType="done"
            blurOnSubmit
          />

          {/* Voice capture — Whisper (Hindi/English/Hinglish) */}
          <Pressable
            onPress={() => void handleMicPress()}
            style={({ pressed }) => [
              styles.micBtn,
              {
                backgroundColor: voiceState === 'recording' ? Colors.urgentBgLight : theme.surface,
                borderColor: voiceState === 'recording' ? Colors.urgentFg : theme.outline,
              },
              pressed && { opacity: 0.8 },
            ]}
            accessibilityRole="button"
            accessibilityLabel={
              voiceState === 'recording' ? 'Stop recording' : 'Dictate task with voice'
            }
          >
            {voiceState === 'transcribing' ? (
              <>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={[styles.micLabel, { color: theme.onSurfaceVariant }]}>
                  Transcribing…
                </Text>
              </>
            ) : voiceState === 'recording' ? (
              <>
                <Ionicons name="stop-circle" size={22} color={Colors.urgentFg} />
                <Text style={[styles.micLabel, { color: Colors.urgentFg }]}>
                  Recording {Math.floor(recordSecs / 60)}:{String(recordSecs % 60).padStart(2, '0')}{' '}
                  — tap to stop
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="mic" size={20} color={theme.primary} />
                <Text style={[styles.micLabel, { color: theme.primary }]}>
                  Speak the task (Hindi / English)
                </Text>
              </>
            )}
          </Pressable>

          {/* Priority selector */}
          <Text style={[styles.label, { color: theme.onSurfaceVariant, marginTop: 24 }]}>
            Priority
          </Text>
          <View style={styles.priorityGrid}>
            {PRIORITIES.map((p) => {
              const color = getPriorityColor(p.value);
              const active = priority === p.value;
              return (
                <Pressable
                  key={p.value}
                  style={[
                    styles.priorityCard,
                    { backgroundColor: theme.surface, borderColor: active ? color : theme.outline },
                    active && { backgroundColor: color + '12', borderWidth: 1.5 },
                  ]}
                  onPress={() => {
                    setPriority(p.value);
                    setPriorityTouched(true);
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View style={[styles.priorityDot, { backgroundColor: color }]} />
                  <View style={styles.priorityText}>
                    <Text
                      style={[styles.priorityLabel, { color: active ? color : theme.onSurface }]}
                    >
                      {p.label}
                    </Text>
                    <Text
                      style={[styles.priorityDesc, { color: theme.onSurfaceVariant }]}
                      numberOfLines={1}
                    >
                      {p.desc}
                    </Text>
                  </View>
                  {active && (
                    <View style={[styles.radioOn, { borderColor: color }]}>
                      <View style={[styles.radioDot, { backgroundColor: color }]} />
                    </View>
                  )}
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Footer */}
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.background, borderTopColor: theme.outline },
          ]}
        >
          <Button
            label="Create task"
            variant="primary"
            onPress={() => void handleCreate()}
            loading={loading}
            fullWidth
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 8, paddingTop: 4 },
  label: { fontSize: 13, fontWeight: '600', marginBottom: 10, marginLeft: 4 },
  titleInput: {
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 100,
    textAlignVertical: 'top',
    lineHeight: 22,
  },
  micBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    borderWidth: 0.5,
    paddingVertical: 12,
    marginTop: 10,
  },
  micLabel: { fontSize: 14, fontWeight: '600' },
  priorityGrid: { gap: 10 },
  priorityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderWidth: 0.5,
    borderRadius: 14,
    gap: 14,
  },
  priorityDot: { width: 12, height: 12, borderRadius: 6 },
  priorityText: { flex: 1 },
  priorityLabel: { fontSize: 15, fontWeight: '600' },
  priorityDesc: { fontSize: 13, marginTop: 2 },
  radioOn: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioDot: { width: 10, height: 10, borderRadius: 5 },
  footer: { padding: 20, paddingTop: 12, borderTopWidth: 0.5 },
});
