import { Stack } from 'expo-router';
import { FestivalPosterGate } from '../../src/components/ui/FestivalPosterGate';

export default function AppLayout() {
  return (
    <>
      <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
      {/* Festival poster popup (SuperAdmin-uploaded), once per user per poster */}
      <FestivalPosterGate />
    </>
  );
}
