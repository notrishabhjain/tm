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

const DEPTH = 4;

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
        <Text style={[styles.stepLabel, { color: theme.primary }]}>STEP 3 OF 4</Text>
        <Text style={[styles.title, { color: theme.primary }]}>VIP Contacts</Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
          Messages from VIP contacts always create URGENT tasks and skip the confirmation queue. Add
          names as they appear in your notifications.
        </Text>

        <View style={[styles.inputWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
          <View style={styles.inputShadow} />
          <View style={[styles.inputRow, { backgroundColor: theme.surface }]}>
            <TextInput
              style={[styles.input, { color: theme.onSurface }]}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Ravi Sharma"
              placeholderTextColor={theme.onSurfaceVariant}
              onSubmitEditing={addVip}
              returnKeyType="done"
            />
            <Pressable style={styles.addButton} onPress={addVip}>
              <Text style={styles.addButtonText}>Add</Text>
            </Pressable>
          </View>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.pickerBtn,
            pressed && { backgroundColor: theme.pressHighlight },
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
            <Text style={[styles.sectionLabel, { color: theme.primary }]}>
              ADDED ({vips.length})
            </Text>
            <View style={[styles.vipListWrapper, { paddingRight: DEPTH, paddingBottom: DEPTH }]}>
              <View style={[styles.vipListShadow, { backgroundColor: Colors.neoShadowUrgent }]} />
              <View
                style={[
                  styles.vipList,
                  { borderColor: Colors.urgentFg, backgroundColor: theme.surface },
                ]}
              >
                {vips.map((v, i) => (
                  <View
                    key={v}
                    style={[
                      styles.vipRow,
                      i < vips.length - 1 && {
                        borderBottomWidth: 1,
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
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { fontSize: 26, fontWeight: '800' },
  description: { fontSize: 14, lineHeight: 22 },
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
  addButton: {
    height: 48,
    paddingHorizontal: 20,
    backgroundColor: Colors.primary900,
    justifyContent: 'center',
    alignItems: 'center',
  },
  addButtonText: { color: Colors.white, fontWeight: '700', fontSize: 14 },
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
  sectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.2,
  },
  vipListWrapper: { position: 'relative' },
  vipListShadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  vipList: {
    borderWidth: 2,
    borderRadius: 2,
    overflow: 'hidden',
  },
  vipRow: { flexDirection: 'row', alignItems: 'center', padding: 14, gap: 10 },
  urgentDot: {
    width: 10,
    height: 10,
    borderRadius: 2,
    backgroundColor: Colors.urgentFg,
    borderWidth: 1.5,
    borderColor: Colors.neoShadowUrgent,
  },
  vipName: { flex: 1, fontSize: 14, fontWeight: '600' },
  removeBtn: { fontSize: 13, color: Colors.urgentFg, fontWeight: '700' },
  footer: { padding: 24, gap: 12 },
});
