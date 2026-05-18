import React from 'react';
import { Tabs } from 'expo-router';
import { Colors } from '@/ui/theme/colors';

export default function TabLayout(): React.JSX.Element {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: Colors.primary900 },
        headerTintColor: Colors.white,
        headerTitleStyle: { fontWeight: '700' },
        tabBarStyle: { backgroundColor: Colors.primary900, borderTopColor: Colors.primary700 },
        tabBarActiveTintColor: Colors.white,
        tabBarInactiveTintColor: Colors.primary300,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Tasks',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color }) => <TabIcon label="⬜" color={color} />,
        }}
      />
      <Tabs.Screen
        name="confirmations"
        options={{
          title: 'Confirm',
          tabBarLabel: 'Confirm',
          tabBarIcon: ({ color }) => <TabIcon label="?" color={color} />,
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: 'History',
          tabBarLabel: 'History',
          tabBarIcon: ({ color }) => <TabIcon label="◷" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarLabel: 'Settings',
          tabBarIcon: ({ color }) => <TabIcon label="⚙" color={color} />,
        }}
      />
    </Tabs>
  );
}

function TabIcon({
  label: _label,
  color: _color,
}: {
  label: string;
  color: string;
}): React.JSX.Element {
  return (
    <React.Fragment>
      {/* Placeholder icon — replace with lucide-react-native icons */}
      <React.Fragment />
    </React.Fragment>
  );
}
