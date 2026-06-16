import React from 'react';
import { Pressable, Text, StyleSheet, ActivityIndicator, type ViewStyle } from 'react-native';
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
      text: Colors.white,
      border: Colors.primary900,
    },
    secondary: {
      bg: theme.surface,
      text: theme.primary,
      border: theme.primary,
    },
    destructive: {
      bg: Colors.urgentFg,
      text: Colors.white,
      border: Colors.urgentFg,
    },
  };

  const v = VARIANT_STYLES[variant];

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg, borderColor: v.border },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: 0.82 },
        style,
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
  );
}

const styles = StyleSheet.create({
  button: {
    height: 50,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  fullWidth: {
    alignSelf: 'stretch',
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
});
