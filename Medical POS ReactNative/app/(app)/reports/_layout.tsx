import { Stack } from 'expo-router';
import { theme } from '../../../constants/theme';

export default function ReportsLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.bg.primary },
      headerTintColor: theme.text.primary,
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: theme.bg.primary },
    }}>
      <Stack.Screen name="index" options={{ title: 'Reports' }} />
      <Stack.Screen name="profit-loss" options={{ title: 'Profit & Loss' }} />
      <Stack.Screen name="gst" options={{ title: 'GST Register' }} />
      <Stack.Screen name="schedule-h1" options={{ title: 'Schedule H1' }} />
      <Stack.Screen name="product-wise" options={{ title: 'Product-wise' }} />
      <Stack.Screen name="expiry-report" options={{ title: 'Expiry Report' }} />
    </Stack>
  );
}
