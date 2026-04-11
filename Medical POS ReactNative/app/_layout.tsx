import { Slot, router } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useSession } from '../hooks/useSession';
import { View, ActivityIndicator } from 'react-native';
import { theme } from '../constants/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useEffect } from 'react';

import { useNotificationListeners, registerForPushNotifications } from '../lib/notifications';

export default function RootLayout() {
  const { loading, user } = useSession();
  
  useNotificationListeners();

  useEffect(() => {
    if (!loading) {
      if (user) {
        registerForPushNotifications();
        router.replace('/(app)');
      } else {
        router.replace('/(auth)/login');
      }
    }
  }, [loading, user]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg.primary }}>
        <ActivityIndicator size="large" color={theme.accent.primary} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <Slot />
        <Toast />
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
