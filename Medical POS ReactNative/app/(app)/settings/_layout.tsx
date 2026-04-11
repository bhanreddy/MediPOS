import { Stack } from 'expo-router';
import { theme } from '../../../constants/theme';

export default function SettingsLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.bg.primary },
      headerTintColor: theme.text.primary,
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: theme.bg.primary },
    }}>
      <Stack.Screen name="index" options={{ title: 'Settings' }} />
      <Stack.Screen name="clinic" options={{ title: 'Clinic Profile' }} />
      <Stack.Screen name="invoice" options={{ title: 'Invoice Settings' }} />
      <Stack.Screen name="users" options={{ title: 'User Management' }} />
    </Stack>
  );
}
