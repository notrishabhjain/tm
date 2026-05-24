import React, { useState, useRef } from 'react';
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
} from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { Colors, getPriorityColor } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import { db } from '@/data/db/client';
import type { Priority } from '@/domain/types';

const taskRepo = new TaskRepository(db);
const DEPTH = 4;

const PRIORITIES: Array<{ value: Priority; label: string; desc: string }> = [
  { value: 'URGENT', label: 'URGENT', desc: 'Needs immediate attention' },
  { value: 'HIGH', label: 'HIGH', desc: 'Important, act soon' },
  { value: 'MEDIUM', label: 'MEDIUM', desc: 'Standard priority' },
  { value: 'LOW', label: 'LOW', desc: 'When time permits' },
];

export default function CreateTaskScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const theme = useTheme();

  const handleCreate = async (): Promise<void> => {
    const trimmed = title.trim();
    if (!trimmed) {
      Alert.alert('Title required', 'Please enter a task description.');
      inputRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      await taskRepo.createTask({
        title: trimmed,
        sourceApp: 'manual',
        priority,
        confidence: 1.0,
        needsConfirmation: false,
        matchedKeywords: ['manual_entry'],
        language: 'EN',
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
    <KeyboardAvoidingView
      style={[styles.root, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          onPress={() => router.back()}
          style={styles.cancelBtn}
          accessibilityRole="button"
        >
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
        <Text style={styles.headerTitle}>New Task</Text>
        <View style={{ width: 64 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Title input */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>WHAT NEEDS TO BE DONE</Text>
        <View style={[styles.inputWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.inputShadow} />
          <TextInput
            ref={inputRef}
            style={[styles.titleInput, { backgroundColor: theme.surface, color: theme.onSurface }]}
            value={title}
            onChangeText={setTitle}
            placeholder="Describe the task clearly..."
            placeholderTextColor={theme.onSurfaceVariant}
            multiline
            numberOfLines={3}
            autoFocus
            returnKeyType="done"
            blurOnSubmit
          />
        </View>

        {/* Priority selector */}
        <Text style={[styles.sectionLabel, { color: theme.primary }]}>PRIORITY</Text>
        <View style={styles.priorityGrid}>
          {PRIORITIES.map((p) => {
            const color = getPriorityColor(p.value);
            const active = priority === p.value;
            return (
              <View
                key={p.value}
                style={[styles.priorityWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}
              >
                <View style={[styles.priorityShadow, { backgroundColor: color + '66' }]} />
                <Pressable
                  style={[
                    styles.priorityCard,
                    { borderColor: active ? color : theme.outline, backgroundColor: theme.surface },
                    active && { backgroundColor: color + '15' },
                  ]}
                  onPress={() => setPriority(p.value)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                >
                  <View
                    style={[
                      styles.priorityDot,
                      { backgroundColor: active ? color : theme.outline },
                    ]}
                  />
                  <View style={styles.priorityText}>
                    <Text
                      style={[
                        styles.priorityLabel,
                        { color: theme.onSurfaceVariant },
                        active && { color },
                      ]}
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
                </Pressable>
              </View>
            );
          })}
        </View>
      </ScrollView>

      {/* Footer */}
      <View
        style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outline }]}
      >
        <Button
          label="Create Task"
          variant="primary"
          onPress={() => void handleCreate()}
          loading={loading}
          fullWidth
        />
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
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
  cancelBtn: { padding: 4, minWidth: 64 },
  cancelText: { fontSize: 15, color: Colors.white, fontWeight: '500' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.white },
  content: { padding: 20, gap: 8, paddingBottom: 8 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
    marginBottom: 8,
    marginTop: 12,
  },
  inputWrapper: { position: 'relative' },
  inputShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Colors.neoShadowDefault,
    borderRadius: 2,
  },
  titleInput: {
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    minHeight: 96,
    textAlignVertical: 'top',
    fontWeight: '500',
  },
  priorityGrid: { gap: 8 },
  priorityWrapper: { position: 'relative' },
  priorityShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  priorityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderWidth: 2,
    borderRadius: 2,
    gap: 12,
  },
  priorityDot: { width: 14, height: 14, borderRadius: 2 },
  priorityText: { flex: 1 },
  priorityLabel: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  priorityDesc: { fontSize: 11, marginTop: 2 },
  footer: {
    padding: 20,
    paddingTop: 12,
    borderTopWidth: 2,
  },
});
