import { Slot, router } from 'expo-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '../lib/queryClient';
import { useSession } from '../hooks/useSession';
import { View, ActivityIndicator, Text } from 'react-native';
import { theme } from '../constants/theme';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { useEffect } from 'react';
import React from 'react';

import { useNotificationListeners, registerForPushNotifications } from '../lib/notifications';

function AuthGate() {
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

  return <Slot />;
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('App Error Boundary:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.bg.primary, padding: 24 }}>
          <Text style={{ color: theme.status.error, fontSize: 20, fontWeight: 'bold', marginBottom: 12 }}>
            Something went wrong
          </Text>
          <Text style={{ color: theme.text.muted, fontSize: 14, textAlign: 'center' }}>
            {this.state.error?.message || 'Unknown error'}
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <AuthGate />
          <Toast />
        </QueryClientProvider>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}

