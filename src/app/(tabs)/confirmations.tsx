import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Primary } from '../../ui/theme/colors';
import { Spacing } from '../../ui/theme/spacing';
import { TypeScale } from '../../ui/theme/typography';

export default function ConfirmationsScreen() {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Pending Confirmations</Text>
        <Text style={styles.placeholder}>
          Coming in Sprint 3 — F-07 Confirmation Flow
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F2F6FB' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: Spacing.md },
  title: { ...TypeScale.headline, color: Primary[900], marginBottom: Spacing.sm },
  placeholder: { ...TypeScale.bodyMd, color: '#4A5159', textAlign: 'center' },
});
