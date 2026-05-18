import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
export default function Screen() {
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F2F6FB' }}>
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '600', color: '#0A2540' }}>transcript</Text>
        <Text style={{ fontSize: 14, color: '#4A5159', marginTop: 8, textAlign: 'center' }}>
          Placeholder — coming in Sprint 2+
        </Text>
      </View>
    </SafeAreaView>
  );
}
