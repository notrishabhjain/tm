import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors } from '@/ui/theme/colors';

const APP_SHORT_NAMES: Record<string, string> = {
  'com.whatsapp': 'WA',
  'com.whatsapp.w4b': 'WA Biz',
  'com.google.android.gm': 'Gmail',
  'com.microsoft.teams': 'Teams',
  'com.slack': 'Slack',
  'org.telegram.messenger': 'TG',
};

interface SourceAppChipProps {
  packageName: string;
  displayName?: string;
}

export function SourceAppChip({ packageName, displayName }: SourceAppChipProps): React.JSX.Element {
  const label =
    displayName ?? APP_SHORT_NAMES[packageName] ?? packageName.split('.').pop() ?? packageName;

  return (
    <View style={styles.chip}>
      <Text style={styles.label} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: Colors.surfaceVariantLight,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  label: {
    fontSize: 11,
    color: Colors.onSurfaceVariantLight,
    fontWeight: '500',
  },
});
