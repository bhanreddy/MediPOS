import { Stack } from 'expo-router';
import { theme } from '../../../constants/theme';

export default function PurchasesLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.bg.primary },
      headerTintColor: theme.text.primary,
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: theme.bg.primary },
    }}>
      <Stack.Screen name="index" options={{ title: 'Purchases' }} />
      <Stack.Screen name="new" options={{ title: 'New Purchase' }} />
      <Stack.Screen name="scan-bill" options={{ title: 'Scan Bill' }} />
      <Stack.Screen name="import-csv" options={{ title: 'Import CSV' }} />
    </Stack>
  );
}
