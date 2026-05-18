import { Stack } from 'expo-router';
import { Colors } from '@/ui/theme/colors';

export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Colors.primary900 },
        animation: 'slide_from_right',
      }}
    />
  );
}
