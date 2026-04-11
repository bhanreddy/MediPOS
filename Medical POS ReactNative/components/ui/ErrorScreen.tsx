import { View, Text } from 'react-native';
import { theme } from '../../constants/theme';
import { Button } from './Button';
import { Ionicons } from '@expo/vector-icons';

interface ErrorScreenProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorScreen({ message = 'Something went wrong', onRetry }: ErrorScreenProps) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
      <Ionicons name="alert-circle-outline" size={64} color={theme.status.error} />
      <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center' }}>
        {message}
      </Text>
      {onRetry && (
        <View style={{ marginTop: 24 }}>
          <Button label="Retry" onPress={onRetry} icon="refresh-outline" />
        </View>
      )}
    </View>
  );
}
