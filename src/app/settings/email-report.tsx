import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { useTheme } from '@/ui/theme';

export default function EmailReportScreen(): React.JSX.Element {
  const theme = useTheme();
  const router = useRouter();

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Daily Email Report</Text>
        <View style={{ width: 56 }} />
      </View>

      <View style={styles.content}>
        <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
          <View style={[styles.statusRow, { borderBottomColor: theme.outline }]}>
            <Text style={[styles.statusLabel, { color: theme.onSurfaceVariant }]}>STATUS</Text>
            <Text style={[styles.statusValue, { color: theme.onSurfaceVariant }]}>
              Not configured
            </Text>
          </View>
          <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>
            Daily email digests summarise your completed and pending tasks. This feature requires
            SMTP server credentials and is not yet available.
          </Text>
        </View>
      </View>
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
  content: { flex: 1, padding: 16 },
  card: {
    marginTop: 8,
    borderWidth: 2,
    borderRadius: 2,
    padding: 16,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  statusLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  statusValue: {
    fontSize: 13,
    fontWeight: '600',
  },
  description: {
    fontSize: 13,
    lineHeight: 20,
  },
});
