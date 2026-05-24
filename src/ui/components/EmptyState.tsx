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
      <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outline }]}>
        <View style={styles.dot} />
        <Text style={[styles.title, { color: theme.onSurface }]}>{title}</Text>
        <Text style={[styles.description, { color: theme.onSurfaceVariant }]}>{description}</Text>
        {actionLabel && onAction && (
          <Button
            label={actionLabel}
            onPress={onAction}
            variant="secondary"
            style={styles.button}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    padding: 28,
    borderWidth: 2,
    borderRadius: 2,
    alignItems: 'center',
  },
  dot: {
    width: 32,
    height: 32,
    borderRadius: 2,
    backgroundColor: Colors.primary100,
    borderWidth: 2,
    borderColor: Colors.primary300,
    marginBottom: 16,
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
    letterSpacing: 0.2,
  },
  description: {
    fontSize: 13,
    textAlign: 'center',
    maxWidth: 280,
    lineHeight: 20,
    marginBottom: 8,
  },
  button: {
    marginTop: 16,
  },
});
