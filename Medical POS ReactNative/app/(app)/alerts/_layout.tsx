import { Stack } from 'expo-router';
import { theme } from '../../../constants/theme';

export default function AlertsLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.bg.primary },
      headerTintColor: theme.text.primary,
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: theme.bg.primary },
    }}>
      <Stack.Screen name="expiry" options={{ title: 'Expiry Alerts' }} />
      <Stack.Screen name="low-stock" options={{ title: 'Low Stock Alerts' }} />
    </Stack>
  );
}
