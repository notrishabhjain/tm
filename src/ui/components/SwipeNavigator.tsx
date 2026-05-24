import React, { useRef } from 'react';
import { View, PanResponder } from 'react-native';
import { useRouter } from 'expo-router';

const TAB_ROUTES = [
  '/(tabs)',
  '/(tabs)/confirmations',
  '/(tabs)/history',
  '/(tabs)/settings',
] as const;

export function SwipeNavigator({
  tabIndex,
  children,
}: {
  tabIndex: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 30 && Math.abs(gs.dx) > Math.abs(gs.dy) * 2,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -60 && tabIndex < TAB_ROUTES.length - 1) {
          router.navigate(TAB_ROUTES[tabIndex + 1] as string);
        } else if (gs.dx > 60 && tabIndex > 0) {
          router.navigate(TAB_ROUTES[tabIndex - 1] as string);
        }
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}
