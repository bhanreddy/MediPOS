import { Stack, Redirect } from 'expo-router';
import { useSessionStore } from '../../store/sessionStore';
import { theme } from '../../constants/theme';

export default function AuthLayout() {
  const { user } = useSessionStore();

  if (user) {
    return <Redirect href="/(app)" />;
  }

  return (
    <Stack screenOptions={{
      headerShown: false,
      contentStyle: { backgroundColor: theme.bg.primary },
    }} />
  );
}
