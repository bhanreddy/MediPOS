import { Stack } from 'expo-router';
import { FestivalPosterGate } from '../../src/components/ui/FestivalPosterGate';
import { useAuthStore } from '@/stores/authStore';

export default function AppLayout() {
  const user = useAuthStore(state => state.user);
  const tenantScope = `${user?.id || ''}:${user?.clinicId || ''}`;
  return (
    <>
      <Stack key={tenantScope} screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      {/* Festival poster popup (SuperAdmin-uploaded), once per user per poster */}
      <FestivalPosterGate />
    </>
  );
}
