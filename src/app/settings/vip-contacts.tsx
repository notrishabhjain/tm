import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { db } from '@/data/db/client';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import { ContactPickerModal } from '@/ui/components/ContactPickerModal';

const repo = new VipContactRepository(db);

export default function VipContactsScreen(): React.JSX.Element {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);

  const { data: contacts = [] } = useQuery({
    queryKey: ['vip-contacts'],
    queryFn: () => repo.getAll(),
  });

  const addMutation = useMutation({
    mutationFn: (identifier: string) => repo.add(identifier, identifier),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vip-contacts'] });
      setName('');
    },
  });

  const removeMutation = useMutation({
    mutationFn: (id: number) => repo.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['vip-contacts'] }),
  });

  const handleAdd = (): void => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (contacts.some((c) => c.identifier.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Already added', `"${trimmed}" is already a VIP contact.`);
      return;
    }
    addMutation.mutate(trimmed);
  };

  const handleContactSelected = (contactName: string): void => {
    addMutation.mutate(contactName);
  };

  const handleRemove = (id: string, displayName: string): void => {
    Alert.alert('Remove VIP', `Remove "${displayName}" from VIP contacts?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => removeMutation.mutate(Number(id)),
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>VIP Contacts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.description}>
          Messages from VIP contacts always create URGENT tasks and skip the confirmation queue. Add
          names as they appear in notifications.
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ravi Sharma"
            placeholderTextColor={Colors.onSurfaceVariantLight}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <Pressable style={styles.addButton} onPress={handleAdd}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        <Pressable style={styles.contactPickerBtn} onPress={() => setPickerVisible(true)}>
          <Text style={styles.contactPickerText}>📇 Pick from Contacts</Text>
        </Pressable>

        {contacts.length === 0 ? (
          <Text style={styles.emptyHint}>
            No VIP contacts yet. Add names to ensure their messages are always treated as URGENT.
          </Text>
        ) : (
          <View style={styles.card}>
            {contacts.map((contact, i) => (
              <View
                key={contact.id}
                style={[styles.row, i < contacts.length - 1 && styles.rowBorder]}
              >
                <Text style={styles.urgentDot}>🔴</Text>
                <Text style={styles.contactName}>{contact.displayName}</Text>
                <Pressable
                  onPress={() => handleRemove(contact.id, contact.displayName)}
                  hitSlop={8}
                >
                  <Text style={styles.removeBtn}>✕</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        <View style={styles.infoCard}>
          <Text style={styles.infoTitle}>How VIP matching works</Text>
          <Text style={styles.infoText}>
            If a notification title contains the VIP name (case-insensitive), the task is
            automatically set to URGENT priority. Use the name as it appears in the notification
            sender field — for WhatsApp, this is typically the contact's saved name.
          </Text>
        </View>
      </ScrollView>

      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleContactSelected}
        existingNames={contacts.map((c) => c.identifier)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
    gap: 12,
  },
  backBtn: { paddingVertical: 4 },
  backText: { fontSize: 17, color: Colors.primary500 },
  title: { fontSize: 17, fontWeight: '600', color: Colors.onSurfaceLight },
  content: { padding: 16, paddingBottom: 32 },
  description: {
    fontSize: 14,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 20,
    marginBottom: 20,
  },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  input: {
    flex: 1,
    height: 48,
    backgroundColor: Colors.surfaceLight,
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 15,
    color: Colors.onSurfaceLight,
    borderWidth: 1,
    borderColor: Colors.outlineLight,
  },
  addButton: {
    height: 48,
    paddingHorizontal: 20,
    backgroundColor: Colors.primary500,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: { color: Colors.white, fontWeight: '600', fontSize: 14 },
  card: {
    backgroundColor: Colors.surfaceLight,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 1,
    marginBottom: 20,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: Colors.outlineLight },
  urgentDot: { fontSize: 12 },
  contactName: { flex: 1, fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  removeBtn: { fontSize: 16, color: Colors.error, fontWeight: '700' },
  contactPickerBtn: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary500,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  contactPickerText: { fontSize: 14, color: Colors.primary500, fontWeight: '600' },
  emptyHint: {
    fontSize: 13,
    color: Colors.onSurfaceVariantLight,
    fontStyle: 'italic',
    marginBottom: 20,
  },
  infoCard: {
    backgroundColor: Colors.primary50,
    borderRadius: 10,
    padding: 14,
    borderLeftWidth: 3,
    borderLeftColor: Colors.primary500,
  },
  infoTitle: { fontSize: 13, fontWeight: '600', color: Colors.primary900, marginBottom: 6 },
  infoText: { fontSize: 13, color: Colors.primary900, lineHeight: 19 },
});
