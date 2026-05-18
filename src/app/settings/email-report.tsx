import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';

export default function EmailReportScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
        <Text style={styles.title}>Daily Email Report</Text>
        <View style={{ width: 70 }} />
      </View>

      <View style={styles.content}>
        <Text style={styles.description}>
          Configure a daily email summary of your task activity. Requires SMTP server credentials.
        </Text>
        <Text style={styles.comingSoon}>Email reports — Sprint 4 feature</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.backgroundLight },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: Colors.surfaceLight,
    borderBottomWidth: 1,
    borderBottomColor: Colors.outlineLight,
  },
  backButton: { padding: 4 },
  backText: { fontSize: 16, color: Colors.primary500, fontWeight: '600' },
  title: { fontSize: 17, fontWeight: '700', color: Colors.onSurfaceLight },
  content: { flex: 1, padding: 24, justifyContent: 'center', alignItems: 'center' },
  description: {
    fontSize: 15,
    color: Colors.onSurfaceVariantLight,
    textAlign: 'center',
    marginBottom: 24,
  },
  comingSoon: { fontSize: 13, color: Colors.primary300, fontStyle: 'italic' },
});
