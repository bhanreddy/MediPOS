import { useEffect } from 'react';
import { LiquidGlassProvider } from '@/components/glass/LiquidGlass';
import { useFonts } from 'expo-font';
import { PlusJakartaSans_400Regular } from '@expo-google-fonts/plus-jakarta-sans/400Regular';
import { PlusJakartaSans_500Medium } from '@expo-google-fonts/plus-jakarta-sans/500Medium';
import { PlusJakartaSans_600SemiBold } from '@expo-google-fonts/plus-jakarta-sans/600SemiBold';
import { PlusJakartaSans_700Bold } from '@expo-google-fonts/plus-jakarta-sans/700Bold';
import { Stack } from 'expo-router';
import { ToastProvider } from '@/components/ui/Toast';
import { QueryClientProvider, focusManager } from '@tanstack/react-query';
import { queryClient } from '@/api/queryClient';
import { BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AppState, Platform, StyleSheet } from 'react-native';
import { useRealtimeEvents } from '@/hooks/useRealtimeEvents';

function QueryLifecycleProvider() {
  useEffect(() => {
    if (Platform.OS === 'web') return;
    focusManager.setFocused(AppState.currentState === null || AppState.currentState === 'active');
    const subscription = AppState.addEventListener('change', state => focusManager.setFocused(state === 'active'));
    return () => {
      subscription.remove();
      focusManager.setFocused(undefined);
    };
  }, []);
  return null;
}

function RealtimeEventsProvider() {
  useRealtimeEvents();
  return null;
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
  });
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={styles.container}>
      <QueryClientProvider client={queryClient}>
        <LiquidGlassProvider>
          <BottomSheetModalProvider>
            <QueryLifecycleProvider />
            <RealtimeEventsProvider />
            <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
              <Stack.Screen name="(auth)" />
              <Stack.Screen name="(app)" />
            </Stack>
            <ToastProvider />
          </BottomSheetModalProvider>
        </LiquidGlassProvider>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
