import React from 'react';
import { Pressable, Text, View, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
import { Colors } from '../theme/colors';
import { useTheme } from '../theme';

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'destructive';
  label: string;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
  disabled?: boolean;
  onPress?: () => void;
}

const DEPTH = 4;

export function Button({
  variant = 'primary',
  label,
  loading = false,
  fullWidth = false,
  style,
  disabled,
  onPress,
}: ButtonProps): React.JSX.Element {
  const theme = useTheme();
  const isDisabled = disabled ?? loading;

  const VARIANT_STYLES = {
    primary: {
      bg: Colors.primary900,
      shadow: Colors.neoShadowDefault,
      border: Colors.neoShadowDefault,
      text: Colors.white,
    },
    secondary: {
      bg: theme.surface,
      shadow: theme.primary,
      border: theme.primary,
      text: theme.primary,
    },
    destructive: {
      bg: Colors.urgentFg,
      shadow: Colors.neoShadowUrgent,
      border: Colors.neoShadowUrgent,
      text: Colors.white,
    },
  };

  const v = VARIANT_STYLES[variant];

  return (
    <View
      style={[
        styles.wrapper,
        { paddingRight: DEPTH, paddingBottom: DEPTH },
        fullWidth && styles.fullWidth,
        style,
      ]}
    >
      <View style={[styles.shadow, { backgroundColor: v.shadow }]} />

      <Pressable
        onPress={isDisabled ? undefined : onPress}
        style={({ pressed }) => [
          styles.button,
          { backgroundColor: v.bg, borderColor: v.border },
          isDisabled && styles.disabled,
          pressed && !isDisabled && { transform: [{ translateX: DEPTH }, { translateY: DEPTH }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={{ disabled: isDisabled }}
      >
        {loading ? (
          <ActivityIndicator color={v.text} size="small" />
        ) : (
          <Text style={[styles.label, { color: v.text }]}>{label}</Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  shadow: {
    position: 'absolute',
    top: DEPTH,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 2,
  },
  button: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 2,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
