import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';
import { useTheme } from '../theme';
import { Button } from './Button';

interface EmptyStateProps {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps): React.JSX.Element {
  const theme = useTheme();
  return (
    <View style={styles.container}>
      <View style={styles.iconCircle}>
        <Text style={styles.iconText}>✓</Text>
      </View>
      <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>
      <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>{description}</Text>
      {actionLabel && onAction && (
        <Button label={actionLabel} onPress={onAction} variant="secondary" style={styles.button} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary50,
    borderWidth: 1.5,
    borderColor: Colors.primary100,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 22,
    color: Colors.primary500,
    fontWeight: '700',
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 21,
    marginBottom: 8,
  },
  button: {
    marginTop: 20,
  },
});
