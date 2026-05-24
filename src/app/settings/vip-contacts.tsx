import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { db } from '@/data/db/client';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';
import { ContactPickerModal } from '@/ui/components/ContactPickerModal';

const repo = new VipContactRepository(db);
const DEPTH = 4;

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
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>VIP Contacts</Text>
        <View style={{ width: 56 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          Messages from VIP contacts always create URGENT tasks and skip the confirmation queue. Add
          names as they appear in notification senders.
        </Text>

        {/* Input row */}
        <View style={[styles.inputWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.inputShadow} />
          <View style={[styles.inputRow, { backgroundColor: theme.surface }]}>
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
              style={({ pressed }) => [
                styles.addBtn,
                pressed && { transform: [{ translateX: DEPTH }, { translateY: DEPTH }] },
              ]}
              onPress={handleAdd}
              accessibilityRole="button"
            >
              <Text style={styles.addBtnText}>Add</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.pickerBtn,
            pressed && styles.pickerBtnPressed,
            pressed && { backgroundColor: theme.pressHighlight },
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
            <Text style={[styles.sectionLabel, { color: theme.primary }]}>
              VIP CONTACTS ({contacts.length})
            </Text>
            <View style={[styles.cardWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
              <View style={[styles.cardShadow, { backgroundColor: Colors.neoShadowUrgent }]} />
              <View
                style={[
                  styles.card,
                  { borderColor: Colors.urgentFg, backgroundColor: theme.surface },
                ]}
              >
                {contacts.map((contact, i) => (
                  <View
                    key={contact.id}
                    style={[
                      styles.row,
                      i < contacts.length - 1 && {
                        borderBottomWidth: 1,
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
            </View>
          </>
        )}

        {/* Info card */}
        <View style={[styles.infoWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={[styles.cardShadow, { backgroundColor: Colors.neoShadowMedium }]} />
          <View
            style={[
              styles.infoCard,
              { borderColor: Colors.mediumFg, backgroundColor: theme.mediumBg },
            ]}
          >
            <Text style={[styles.infoTitle, { color: theme.primary }]}>How VIP matching works</Text>
            <Text style={[styles.infoText, { color: theme.onSurface }]}>
              If a notification sender contains the VIP name (case-insensitive), the task is
              automatically URGENT priority. Use the name as it appears in the notification — for
              WhatsApp, this is typically the contact's saved name.
            </Text>
          </View>
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
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  description: { fontSize: 13, lineHeight: 20 },
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
    marginBottom: 4,
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
  inputRow: {
    flexDirection: 'row',
    gap: 0,
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
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
    backgroundColor: Colors.primary900,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addBtnText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
  pickerBtn: {
    height: 48,
    borderWidth: 2,
    borderColor: Colors.primary900,
    borderRadius: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerBtnPressed: {},
  pickerBtnText: { fontSize: 14, fontWeight: '700' },
  emptyHint: { fontSize: 13, lineHeight: 20 },
  cardWrapper: { position: 'relative' },
  cardShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  card: {
    borderWidth: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  urgentDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: Colors.urgentFg,
    borderWidth: 1.5,
    borderColor: Colors.neoShadowUrgent,
  },
  contactName: { flex: 1, fontSize: 15, fontWeight: '600' },
  removeBtn: { fontSize: 13, color: Colors.urgentFg, fontWeight: '700' },
  infoWrapper: { position: 'relative' },
  infoCard: {
    borderWidth: 2,
    borderRadius: 2,
    padding: 14,
  },
  infoTitle: { fontSize: 13, fontWeight: '700', marginBottom: 6 },
  infoText: { fontSize: 13, lineHeight: 19 },
});
