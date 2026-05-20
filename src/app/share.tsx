import React, { useEffect, useState } from 'react';
import { View, Text, TextInput, StyleSheet, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';
import { db } from '@/data/db/client';
import { TaskRepository } from '@/data/repositories/TaskRepository';
import NotificationListener from '../../modules/notification-listener/src';

const taskRepo = new TaskRepository(db);

interface ParsedShare {
  sender: string;
  message: string;
  timestamp: string;
  rawText: string;
}

function parseWhatsAppShare(text: string): ParsedShare {
  // WhatsApp format: "[DD/MM/YY, HH:MM AM] Contact Name: message"
  const waPattern =
    /^\[(\d{1,2}\/\d{1,2}\/\d{2,4},\s*\d{1,2}:\d{2}\s*(?:AM|PM)?)\]\s+([^:]+):\s+([\s\S]+)$/i;
  const match = waPattern.exec(text.trim());

  if (match) {
    return {
      sender: match[2].trim(),
      message: match[3].trim(),
      timestamp: match[1].trim(),
      rawText: text,
    };
  }

  // No WhatsApp format detected — use raw text
  return {
    sender: '',
    message: text.trim(),
    timestamp: new Date().toLocaleString(),
    rawText: text,
  };
}

export default function ShareScreen(): React.JSX.Element {
  const router = useRouter();
  const [parsed, setParsed] = useState<ParsedShare | null>(null);
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void loadShareIntent();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadShareIntent = async (): Promise<void> => {
    try {
      const intent = await NotificationListener.getLastShareIntent();
      if (!intent?.text) {
        setError('No shared text found. Please try sharing again from WhatsApp.');
        setLoading(false);
        return;
      }
      const p = parseWhatsAppShare(intent.text);
      setParsed(p);
      const suggestedTitle = p.sender
        ? `${p.sender}: ${p.message.slice(0, 60)}`
        : p.message.slice(0, 80);
      setTitle(suggestedTitle);
    } catch {
      setError('Could not read shared content. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (): Promise<void> => {
    if (!parsed || !title.trim()) return;
    setSaving(true);
    try {
      await taskRepo.createTask({
        title: title.trim(),
        body: parsed.rawText,
        sourceApp: 'com.whatsapp',
        sender: parsed.sender || undefined,
        priority: 'MEDIUM',
        confidence: 0.9,
        needsConfirmation: true,
        matchedKeywords: ['shared_message'],
        language: 'EN',
      });
      router.replace('/(tabs)/confirmations');
    } catch {
      setError('Failed to create task. Please try again.');
      setSaving(false);
    }
  };

  const handleDiscard = (): void => {
    router.replace('/(tabs)');
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Colors.primary500} size="large" />
        <Text style={styles.loadingText}>Reading shared content...</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error}</Text>
        <Button label="Go to Home" onPress={handleDiscard} variant="secondary" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Create Task from Share</Text>
        <Text style={styles.headerSub}>Review and confirm the task details below.</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {parsed?.sender ? (
          <View style={styles.metaCard}>
            <Text style={styles.metaLabel}>From</Text>
            <Text style={styles.metaValue}>{parsed.sender}</Text>
            {parsed.timestamp ? (
              <>
                <Text style={styles.metaLabel}>Time</Text>
                <Text style={styles.metaValue}>{parsed.timestamp}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.fieldLabel}>Task Title</Text>
        <TextInput
          style={styles.titleInput}
          value={title}
          onChangeText={setTitle}
          multiline
          placeholder="Describe the task..."
          placeholderTextColor={Colors.onSurfaceVariantLight}
          returnKeyType="done"
        />

        <Text style={styles.fieldLabel}>Original Message</Text>
        <View style={styles.messageBox}>
          <Text style={styles.messageText}>{parsed?.message}</Text>
        </View>

        <Text style={styles.confirmNote}>
          This task will be added to the Confirmation queue for your review.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label={saving ? 'Creating...' : 'Add to Confirmation Queue'}
          onPress={() => void handleCreate()}
          fullWidth
        />
        <Button label="Discard" variant="secondary" onPress={handleDiscard} fullWidth />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: Colors.backgroundLight,
    padding: 24,
  },
  loadingText: { fontSize: 14, color: Colors.onSurfaceVariantLight },
  errorText: {
    fontSize: 14,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 56,
    paddingBottom: 16,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.primary900, marginBottom: 4 },
  headerSub: { fontSize: 13, color: Colors.onSurfaceVariantLight },
  content: { padding: 20, paddingBottom: 32 },
  metaCard: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    padding: 14,
    marginBottom: 20,
    gap: 2,
    elevation: 1,
  },
  metaLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 6,
  },
  metaValue: { fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.onSurfaceVariantLight,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
    marginLeft: 2,
  },
  titleInput: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.onSurfaceLight,
    borderWidth: 1,
    borderColor: Colors.outlineLight,
    marginBottom: 20,
    minHeight: 56,
    textAlignVertical: 'top',
  },
  messageBox: {
    backgroundColor: Colors.primary50,
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary300,
  },
  messageText: { fontSize: 14, color: Colors.primary900, lineHeight: 21 },
  confirmNote: {
    fontSize: 12,
    color: Colors.onSurfaceVariantLight,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  footer: { padding: 20, gap: 12 },
});
