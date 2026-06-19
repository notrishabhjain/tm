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
    primary: { bg: Colors.primary500, text: Colors.white, border: 'transparent' },
    secondary: { bg: theme.surfaceVariant, text: theme.onSurface, border: 'transparent' },
    destructive: { bg: 'transparent', text: Colors.urgentFg, border: Colors.urgentFg },
  };

  const v = VARIANT_STYLES[variant];

  return (
    <Pressable
      onPress={isDisabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: v.bg,
          borderColor: v.border,
          borderWidth: v.border === 'transparent' ? 0 : 1.5,
        },
        fullWidth && styles.fullWidth,
        isDisabled && styles.disabled,
        pressed && !isDisabled && { opacity: 0.7 },
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
    height: 52,
    paddingHorizontal: 24,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 80,
  },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.4 },
  label: { fontSize: 15, fontWeight: '600', letterSpacing: 0.1 },
});
