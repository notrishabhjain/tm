import React from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/ui/theme';
import { Colors } from '@/ui/theme/colors';

export default function TabLayout(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopWidth: 0.5,
          borderTopColor: theme.outline,
          height: 56 + insets.bottom,
          paddingBottom: insets.bottom + 4,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: Colors.primary500,
        tabBarInactiveTintColor: theme.onSurfaceVariant,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600', marginTop: 2 },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tasks',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="confirmations"
        options={{
          title: 'Review',
          tabBarLabel: 'Review',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons
              name={focused ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={size}
              color={color}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarLabel: 'History',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'time' : 'time-outline'} size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color, size, focused }) => (
            <Ionicons name={focused ? 'settings' : 'settings-outline'} size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
