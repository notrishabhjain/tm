import React, { useRef } from 'react';
import { View, PanResponder, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';

const TAB_ROUTES = [
  '/(tabs)',
  '/(tabs)/confirmations',
  '/(tabs)/history',
  '/(tabs)/settings',
] as const;

// Swipe from within the outer 15 % of screen width (edge zone) to change tabs.
// This avoids conflicts with vertical ScrollView / FlatList content in the centre.
const EDGE_FRACTION = 0.15;
const MIN_SWIPE_PX = 50;

export function SwipeNavigator({
  tabIndex,
  children,
}: {
  tabIndex: number;
  children: React.ReactNode;
}): React.JSX.Element {
  const router = useRouter();
  const isEdgeGestureRef = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      // Claim gesture immediately only when the touch starts in the edge zone.
      onStartShouldSetPanResponder: (evt) => {
        const { width } = Dimensions.get('window');
        const x = evt.nativeEvent.locationX ?? evt.nativeEvent.pageX;
        const inEdge = x < width * EDGE_FRACTION || x > width * (1 - EDGE_FRACTION);
        isEdgeGestureRef.current = inEdge;
        return inEdge;
      },
      // Also capture clearly-horizontal moves anywhere on screen (fallback for
      // screens without heavy vertical content, e.g. empty states).
      onMoveShouldSetPanResponder: (_, gs) =>
        !isEdgeGestureRef.current &&
        Math.abs(gs.dx) > 30 &&
        Math.abs(gs.dx) > Math.abs(gs.dy) * 2.5,
      onPanResponderRelease: (_, gs) => {
        isEdgeGestureRef.current = false;
        if (gs.dx < -MIN_SWIPE_PX && tabIndex < TAB_ROUTES.length - 1) {
          router.navigate(TAB_ROUTES[tabIndex + 1] as string);
        } else if (gs.dx > MIN_SWIPE_PX && tabIndex > 0) {
          router.navigate(TAB_ROUTES[tabIndex - 1] as string);
        }
      },
      onPanResponderTerminate: () => {
        isEdgeGestureRef.current = false;
      },
    })
  ).current;

  return (
    <View style={{ flex: 1 }} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}
