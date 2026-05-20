import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  Pressable,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Contacts from 'expo-contacts';
import { Colors } from '@/ui/theme/colors';
import { Button } from '@/ui/components/Button';

export default function OnboardingVipScreen(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');
  const [vips, setVips] = useState<string[]>([]);

  const addVip = (): void => {
    const trimmed = name.trim();
    if (trimmed && !vips.includes(trimmed)) {
      setVips((prev) => [...prev, trimmed]);
      setName('');
    }
  };

  const removeVip = (n: string): void => {
    setVips((prev) => prev.filter((v) => v !== n));
  };

  const pickContact = async (): Promise<void> => {
    if (Platform.OS !== 'android') return;
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Permission needed',
        'Allow contacts access so TaskMind can pick a contact from your address book.',
        [{ text: 'OK' }]
      );
      return;
    }
    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.Name],
      sort: Contacts.SortTypes.FirstName,
    });
    const names = data
      .map((c) => c.name ?? '')
      .filter((n) => n.length > 0)
      .slice(0, 300);

    if (names.length === 0) {
      Alert.alert('No contacts', 'No contacts found in your address book.');
      return;
    }

    Alert.alert('Pick a VIP contact', 'Choose from your recent contacts:', [
      ...names.slice(0, 6).map((n) => ({
        text: n,
        onPress: () => {
          if (!vips.includes(n)) setVips((prev) => [...prev, n]);
        },
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.stepLabel}>Step 3 of 4</Text>
        <Text style={styles.title}>VIP Contacts</Text>
        <Text style={styles.description}>
          Messages from VIP contacts always create URGENT tasks and skip the confirmation queue. Add
          names as they appear in your notifications.
        </Text>

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ravi Sharma"
            placeholderTextColor={Colors.onSurfaceVariantLight}
            onSubmitEditing={addVip}
            returnKeyType="done"
          />
          <Pressable style={styles.addButton} onPress={addVip}>
            <Text style={styles.addButtonText}>Add</Text>
          </Pressable>
        </View>

        <Pressable style={styles.contactPickerBtn} onPress={() => void pickContact()}>
          <Text style={styles.contactPickerText}>📇 Pick from Contacts</Text>
        </Pressable>

        {vips.map((v) => (
          <View key={v} style={styles.vipRow}>
            <Text style={styles.urgentDot}>🔴</Text>
            <Text style={styles.vipName}>{v}</Text>
            <Pressable onPress={() => removeVip(v)} hitSlop={8}>
              <Text style={styles.removeBtn}>✕</Text>
            </Pressable>
          </View>
        ))}

        {vips.length === 0 && (
          <Text style={styles.emptyHint}>
            No VIP contacts yet. You can skip this and add them later in Settings.
          </Text>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Continue →"
          onPress={() => void router.push('/onboarding/priority')}
          fullWidth
        />
        <Button
          label="Skip"
          variant="secondary"
          onPress={() => void router.push('/onboarding/priority')}
          fullWidth
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  content: { padding: 24 },
  stepLabel: { fontSize: 12, color: Colors.onSurfaceVariantLight, marginBottom: 8 },
  title: { fontSize: 26, fontWeight: '700', color: Colors.primary900, marginBottom: 12 },
  description: {
    fontSize: 15,
    color: Colors.onSurfaceVariantLight,
    lineHeight: 24,
    marginBottom: 24,
  },
  inputRow: { flexDirection: 'row', gap: 8, marginBottom: 10 },
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
  contactPickerBtn: {
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.primary500,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  contactPickerText: { fontSize: 14, color: Colors.primary500, fontWeight: '600' },
  vipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surfaceLight,
    padding: 14,
    borderRadius: 8,
    marginBottom: 8,
    gap: 10,
    elevation: 1,
  },
  urgentDot: { fontSize: 12 },
  vipName: { flex: 1, fontSize: 15, color: Colors.onSurfaceLight, fontWeight: '500' },
  removeBtn: { fontSize: 16, color: Colors.error, fontWeight: '700' },
  emptyHint: { fontSize: 13, color: Colors.onSurfaceVariantLight, fontStyle: 'italic' },
  footer: { padding: 24, gap: 12 },
});
