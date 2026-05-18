import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '@/ui/theme/colors';
import { EmptyState } from '@/ui/components/EmptyState';

export default function VocabularyScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} style={styles.backButton}>
          <Text style={styles.backText}>‹ Settings</Text>
        </Pressable>
        <Text style={styles.title}>Learned Vocabulary</Text>
        <View style={{ width: 70 }} />
      </View>

      <EmptyState
        title="No learned keywords yet"
        description="As you confirm and complete tasks, TaskMind learns which words indicate actionable messages. Keywords will appear here after 2-3 weeks of use."
      />
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
});
