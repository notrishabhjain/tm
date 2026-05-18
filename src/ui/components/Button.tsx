import React from 'react';
import {
  Pressable,
  Text,
  StyleSheet,
  ActivityIndicator,
  type PressableProps,
  type ViewStyle,
} from 'react-native';
import { Colors } from '../theme/colors';

interface ButtonProps extends PressableProps {
  variant?: 'primary' | 'secondary' | 'destructive';
  label: string;
  loading?: boolean;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({
  variant = 'primary',
  label,
  loading = false,
  fullWidth = false,
  style,
  disabled,
  ...rest
}: ButtonProps): React.JSX.Element {
  const isDisabled = disabled ?? loading;

  const containerStyle = [
    styles.base,
    variant === 'primary' && styles.primary,
    variant === 'secondary' && styles.secondary,
    variant === 'destructive' && styles.destructive,
    isDisabled && styles.disabled,
    fullWidth && styles.fullWidth,
    style,
  ];

  const textColor =
    variant === 'secondary'
      ? Colors.primary500
      : variant === 'destructive'
        ? Colors.white
        : Colors.white;

  return (
    <Pressable
      {...rest}
      disabled={isDisabled}
      style={({ pressed }) => [containerStyle, pressed && !isDisabled && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={textColor} size="small" />
      ) : (
        <Text style={[styles.label, { color: textColor }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    height: 48,
    paddingHorizontal: 24,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
    minWidth: 80,
  },
  primary: {
    backgroundColor: Colors.primary500,
  },
  secondary: {
    backgroundColor: Colors.transparent,
    borderWidth: 1,
    borderColor: Colors.primary500,
  },
  destructive: {
    backgroundColor: Colors.error,
  },
  disabled: {
    opacity: 0.5,
  },
  pressed: {
    opacity: 0.8,
  },
  fullWidth: {
    width: '100%',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.25,
  },
});
