import { View, Text } from 'react-native';
import { theme } from '../../constants/theme';
import { Button } from './Button';
import { Ionicons } from '@expo/vector-icons';

interface EmptyStateProps {
  message: string;
  subMessage?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ message, subMessage, icon = 'folder-open-outline', actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Ionicons name={icon} size={64} color={theme.text.muted} />
      <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
        {message}
      </Text>
      {subMessage && (
        <Text style={{ color: theme.text.muted, fontSize: 14, marginTop: 8, textAlign: 'center' }}>
          {subMessage}
        </Text>
      )}
      {actionLabel && onAction && (
        <View style={{ marginTop: 24 }}>
          <Button label={actionLabel} onPress={onAction} />
        </View>
      )}
    </View>
  );
}
