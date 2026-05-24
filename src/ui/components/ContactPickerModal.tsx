import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  existingNames: string[];
}

export function ContactPickerModal({
  visible,
  onClose,
  onSelect,
  existingNames,
}: Props): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const [allContacts, setAllContacts] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (visible) {
      void loadContacts();
    } else {
      setSearch('');
    }
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadContacts = async (): Promise<void> => {
    setLoading(true);
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission needed',
          'Allow contacts access so TaskMind can pick a contact from your address book.',
          [{ text: 'OK' }]
        );
        onClose();
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Name],
      });
      const names = data
        .map((c) => c.name ?? '')
        .filter((n) => n.length > 0)
        .sort((a, b) => a.localeCompare(b));
      setAllContacts(names);
    } catch {
      Alert.alert('Error', 'Could not load contacts. Please try again.');
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const filtered = allContacts.filter(
    (n) =>
      n.toLowerCase().includes(search.toLowerCase()) &&
      !existingNames.some((e) => e.toLowerCase() === n.toLowerCase())
  );

  const handleSelect = (name: string): void => {
    onSelect(name);
    setSearch('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: insets.top + 14 }]}>
          <Text style={styles.title}>
            Pick a Contact{allContacts.length > 0 ? ` (${allContacts.length})` : ''}
          </Text>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeHit}>
            <Text style={styles.closeBtn}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.searchBar}>
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search contacts..."
            placeholderTextColor={Colors.onSurfaceVariantLight}
            autoFocus
            returnKeyType="search"
          />
        </View>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary500} />
            <Text style={styles.hintText}>Loading contacts...</Text>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.hintText}>
              {search ? 'No contacts match your search.' : 'No new contacts available to add.'}
            </Text>
            {!search && allContacts.length < 10 && allContacts.length > 0 && (
              <Text style={styles.hintText}>
                Only {allContacts.length} contact{allContacts.length !== 1 ? 's' : ''} found. If you
                have more, go to Settings → Apps → TaskMind → Permissions → Contacts → Allow all
                contacts.
              </Text>
            )}
          </View>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(item, index) => `${item}-${index}`}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.contactRow,
                  pressed && styles.contactRowPressed,
                  pressed && { backgroundColor: theme.pressHighlight },
                ]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.avatar}>
                  <Text style={[styles.avatarLetter, { color: theme.primary }]}>
                    {item[0]?.toUpperCase() ?? '?'}
                  </Text>
                </View>
                <Text style={styles.contactName}>{item}</Text>
                <Text style={styles.addIcon}>+</Text>
              </Pressable>
            )}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  title: { fontSize: 17, fontWeight: '600', color: Colors.onSurfaceLight },
  closeHit: { padding: 4 },
  closeBtn: { fontSize: 14, color: Colors.onSurfaceVariantLight, fontWeight: '600' },
  searchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  searchInput: {
    height: 42,
    backgroundColor: Colors.backgroundLight,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 15,
    color: Colors.onSurfaceLight,
    borderWidth: 1,
    borderColor: Colors.outlineLight,
  },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  hintText: {
    fontSize: 14,
    color: Colors.onSurfaceVariantLight,
    fontStyle: 'italic',
    textAlign: 'center',
    marginHorizontal: 32,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.surfaceLight,
    gap: 12,
  },
  contactRowPressed: {},
  avatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: Colors.primary100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 15, fontWeight: '700' },
  contactName: { flex: 1, fontSize: 15, color: Colors.onSurfaceLight },
  addIcon: { fontSize: 22, color: Colors.primary500, fontWeight: '700' },
  separator: { height: 1, backgroundColor: Colors.outlineLight, marginLeft: 66 },
});
