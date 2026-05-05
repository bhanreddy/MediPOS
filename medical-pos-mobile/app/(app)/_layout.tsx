import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { runSyncCycle } from '@/sync/syncEngine';

export default function AppLayout() {
  useEffect(() => {
    // Perform an initial pull/push of data when entering the authenticated app
    runSyncCycle().catch(console.error);
  }, []);

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}
