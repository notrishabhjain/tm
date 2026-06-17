import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';
import { Button } from '@/ui/components/Button';
import { ContactPickerModal } from '@/ui/components/ContactPickerModal';
import { db, initializeDatabase } from '@/data/db/client';
import { VipContactRepository } from '@/data/repositories/VipContactRepository';

export default function OnboardingVipScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState('');
  const [vips, setVips] = useState<string[]>([]);
  const [pickerVisible, setPickerVisible] = useState(false);

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

  const handleContactSelected = (contactName: string): void => {
    if (!vips.includes(contactName)) {
      setVips((prev) => [...prev, contactName]);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.stepLabel, { color: theme.primary }]}>Step 3 of 4</Text>
        <Text style={[styles.title, { color: theme.onSurface }]}>VIP Contacts</Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          Messages from VIP contacts always create URGENT tasks and skip the confirmation queue. Add
          names as they appear in your notifications.
        </Text>

        <View style={[styles.inputRow, { backgroundColor: theme.surfaceVariant }]}>
          <TextInput
            style={[styles.input, { color: theme.onSurface }]}
            value={name}
            onChangeText={setName}
            placeholder="e.g. Ravi Sharma"
            placeholderTextColor={theme.onSurfaceVariant}
            onSubmitEditing={addVip}
            returnKeyType="done"
          />
          <Pressable
            style={({ pressed }) => [styles.addButton, pressed && { opacity: 0.7 }]}
            onPress={addVip}
          >
            <Text style={styles.addButtonText}>Add</Text>
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

        {vips.length === 0 ? (
          <Text style={[styles.emptyHint, { color: theme.onSurfaceVariant }]}>
            No VIP contacts yet. You can skip this and add them later in Settings.
          </Text>
        ) : (
          <>
            <Text style={[styles.sectionLabel, { color: theme.onSurfaceVariant }]}>
              Added ({vips.length})
            </Text>
            <View style={[styles.vipList, { backgroundColor: theme.surfaceVariant }]}>
              {vips.map((v, i) => (
                <View
                  key={v}
                  style={[
                    styles.vipRow,
                    i < vips.length - 1 && {
                      borderBottomWidth: 0.5,
                      borderBottomColor: theme.outline,
                    },
                  ]}
                >
                  <View style={styles.urgentDot} />
                  <Text style={[styles.vipName, { color: theme.onSurface }]}>{v}</Text>
                  <Pressable onPress={() => removeVip(v)} hitSlop={8}>
                    <Text style={styles.removeBtn}>Remove</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <Button
          label="Continue"
          onPress={() =>
            void (async () => {
              if (vips.length > 0) {
                try {
                  initializeDatabase();
                  const repo = new VipContactRepository(db);
                  await Promise.all(vips.map((n) => repo.add(n, n, 'manual')));
                } catch {
                  // DB write failed — non-fatal, continue onboarding
                }
              }
              router.push('/onboarding/priority');
            })()
          }
          fullWidth
        />
        <Button
          label="Skip"
          variant="secondary"
          onPress={() => void router.push('/onboarding/priority')}
          fullWidth
        />
      </View>

      <ContactPickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        onSelect={handleContactSelected}
        existingNames={vips}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24, gap: 12 },
  stepLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  description: { fontSize: 14, lineHeight: 22 },
  inputRow: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
  },
  input: {
    flex: 1,
    height: 46,
    paddingHorizontal: 14,
    fontSize: 15,
  },
  addButton: {
    height: 46,
    paddingHorizontal: 20,
    backgroundColor: Colors.primary500,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: { color: Colors.white, fontWeight: '600', fontSize: 14 },
  pickerBtn: {
    height: 46,
    borderWidth: 0.5,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerBtnText: { fontSize: 14, fontWeight: '600' },
  emptyHint: { fontSize: 13, lineHeight: 20 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  vipList: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  vipRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  urgentDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: Colors.urgentFg,
  },
  vipName: { flex: 1, fontSize: 14, fontWeight: '600' },
  removeBtn: { fontSize: 13, color: Colors.urgentFg, fontWeight: '600' },
  footer: { padding: 24, gap: 12 },
});
