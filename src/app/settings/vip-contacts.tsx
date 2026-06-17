import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Screen, LargeHeader } from '@/ui/components/Screen';
import { db } from '@/data/db/client';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import { ContactPickerModal } from '@/ui/components/ContactPickerModal';

const repo = new VipContactRepository(db);

export default function VipContactsScreen(): React.JSX.Element {
  const theme = useTheme();
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
      { text: 'Remove', style: 'destructive', onPress: () => removeMutation.mutate(Number(id)) },
    ]);
  };

  return (
    <Screen>
      <LargeHeader title="VIP Contacts" onBack={() => router.back()} />

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          Messages from VIP contacts always create URGENT tasks and skip the confirmation queue. Add
          names as they appear in notification senders.
        </Text>

        {/* Input row */}
        <View
          style={[styles.inputRow, { backgroundColor: theme.surface, borderColor: theme.outline }]}
        >
          <TextInput
            style={[styles.input, { color: theme.onSurface }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ravi Sharma"
            placeholderTextColor={theme.onSurfaceVariant}
            onSubmitEditing={handleAdd}
            returnKeyType="done"
          />
          <Pressable
            style={({ pressed }) => [styles.addBtn, pressed && { opacity: 0.7 }]}
            onPress={handleAdd}
            accessibilityRole="button"
          >
            <Text style={styles.addBtnText}>Add</Text>
          </Pressable>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.pickerBtn,
            { borderColor: theme.outline },
            pressed && { opacity: 0.7 },
          ]}
          onPress={() => setPickerVisible(true)}
          accessibilityRole="button"
        >
          <Text style={[styles.pickerBtnText, { color: theme.primary }]}>Pick from Contacts</Text>
        </Pressable>

        {contacts.length === 0 ? (
          <Text style={[styles.emptyHint, { color: theme.onSurfaceVariant }]}>
            No VIP contacts yet. Messages from VIP senders skip confirmation and become URGENT.
          </Text>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
              VIP contacts ({contacts.length})
            </Text>
            <View
              style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}
            >
              {contacts.map((contact, i) => (
                <View
                  key={contact.id}
                  style={[
                    styles.row,
                    i < contacts.length - 1 && {
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.outline,
                    },
                  ]}
                >
                  <View style={styles.urgentDot} />
                  <Text style={[styles.contactName, { color: theme.onSurface }]}>
                    {contact.displayName}
                  </Text>
                  <Pressable
                    onPress={() => handleRemove(contact.id, contact.displayName)}
                    hitSlop={8}
                  >
                    <Text style={styles.removeBtn}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Info card */}
        <View
          style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.outline }]}
        >
          <Text style={[styles.infoTitle, { color: theme.primary }]}>How VIP matching works</Text>
          <Text style={[styles.infoText, { color: theme.onSurface }]}>
            If a notification sender contains the VIP name (case-insensitive), the task is
            automatically URGENT priority. Use the name as it appears in the notification — for
            WhatsApp, this is typically the contact's saved name.
          </Text>
        </View>
      </ScrollView>

      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleContactSelected}
        existingNames={contacts.map((c) => c.identifier)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  description: { fontSize: 13, lineHeight: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 4,
  },
  inputRow: {
    flexDirection: 'row',
    borderWidth: 0.5,
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    height: 48,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  addBtn: {
    height: 48,
    paddingHorizontal: 20,
    backgroundColor: Colors.primary500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: Colors.white, fontWeight: '600', fontSize: 14 },
  pickerBtn: {
    height: 48,
    borderWidth: 0.5,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerBtnText: { fontSize: 14, fontWeight: '600' },
  emptyHint: { fontSize: 13, lineHeight: 20 },
  card: {
    borderWidth: 0.5,
    borderRadius: 16,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  urgentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.urgentFg,
  },
  contactName: { flex: 1, fontSize: 15, fontWeight: '600' },
  removeBtn: { fontSize: 13, color: Colors.urgentFg, fontWeight: '600' },
  infoCard: {
    borderWidth: 0.5,
    borderRadius: 16,
    padding: 16,
  },
  infoTitle: { fontSize: 13, fontWeight: '600', marginBottom: 6 },
  infoText: { fontSize: 13, lineHeight: 19 },
});
