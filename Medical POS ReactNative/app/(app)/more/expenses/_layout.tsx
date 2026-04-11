import { Stack } from 'expo-router';
import { theme } from '../../../../constants/theme';

export default function ExpensesLayout() {
  return (
    <Stack screenOptions={{
      headerStyle: { backgroundColor: theme.bg.primary },
      headerTintColor: theme.text.primary,
      headerTitleStyle: { fontWeight: '700' },
      contentStyle: { backgroundColor: theme.bg.primary },
    }}>
      <Stack.Screen name="index" options={{ title: 'Expenses' }} />
      <Stack.Screen name="new" options={{ title: 'Add Expense' }} />
    </Stack>
  );
}
