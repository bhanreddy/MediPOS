import { View, Text, ActivityIndicator } from 'react-native';
import { theme } from '../../constants/theme';

export function LoadingScreen({ message = 'Loading...' }: { message?: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, justifyContent: 'center', alignItems: 'center' }}>
      <ActivityIndicator size="large" color={theme.accent.primary} />
      {message && <Text style={{ color: theme.text.muted, marginTop: 12, fontSize: 16 }}>{message}</Text>}
    </View>
  );
}
