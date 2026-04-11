import { Stack } from 'expo-router';
import { theme } from '../../../../constants/theme';

export default function AccountingLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.bg.primary },
      headerTintColor: theme.text.primary,
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: theme.bg.primary },
    }}>
      <Stack.Screen name="index" options={{ title: 'Accounting' }} />
    </Stack>
  );
}
