import { Stack } from 'expo-router';
import { theme } from '../../../constants/theme';

export default function MoreLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.bg.primary },
      headerTintColor: theme.text.primary,
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: theme.bg.primary },
    }}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="suppliers" options={{ headerShown: false }} />
      <Stack.Screen name="expenses" options={{ headerShown: false }} />
      <Stack.Screen name="accounting" options={{ headerShown: false }} />
    </Stack>
  );
}
