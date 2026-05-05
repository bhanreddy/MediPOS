import { Stack } from 'expo-router';
import { ToastProvider } from '@/components/ui/Toast';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StyleSheet } from 'react-native';
import { useEffect } from 'react';
import { initLocalDatabase } from '@/db';
import { registerBackgroundSync } from '@/sync/backgroundSync';
import { startSyncListener, flushSyncQueue } from '@/db/billsSyncEngine';
import useAuthStore from '@/stores/authStore'; // Assuming a generic auth store or SecureStore

export default function RootLayout() {
  useEffect(() => {
    // Initialize SQLite database schema
    initLocalDatabase();
    
    // Register background sync task
    registerBackgroundSync().catch(console.error);

    // Start bills offline sync listener
    const getToken = async () => {
      // In a real app this would get token from secure store
      return 'DUMMY_TOKEN'; 
    };
    startSyncListener(getToken);
    getToken().then(token => {
      if (token) flushSyncQueue(token);
    });
  }, []);

  return (
    <GestureHandlerRootView style={styles.container}>
      <QueryClientProvider client={queryClient}>
        <BottomSheetModalProvider>
          <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(app)" />
          </Stack>
          <ToastProvider />
        </BottomSheetModalProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
