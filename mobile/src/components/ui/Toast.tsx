import { AppText as Text } from '@/components/ui/AppText';
import { useGlassPreferences } from '@/components/glass/LiquidGlass';
import React, { useEffect } from 'react';
import { StyleSheet, View, Pressable, useWindowDimensions } from 'react-native';
import Animated, { FadeOutUp, SlideInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore, type ToastType } from '@/stores/uiStore';

const ICONS: Record<ToastType, keyof typeof Ionicons.glyphMap> = {
  success: 'checkmark-circle-outline', error: 'close-circle-outline', info: 'information-circle-outline', warning: 'alert-circle-outline',
};

export function ToastProvider() {
  const toast = useUIStore(s => s.toasts[0]);
  const remove = useUIStore(s => s.removeToast);
  const { theme } = useTheme();
  const { reduceMotion } = useGlassPreferences();
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  // FIFO: each message receives its full reading time after it reaches the front.
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => remove(toast.id), toast.type === 'error' ? 6000 : 4500);
    return () => clearTimeout(timer);
  }, [toast?.id, toast?.type, remove]);
  if (!toast) return null;
  const c = theme.colors;
  const tones = { success: [c.success, c.successLight], error: [c.danger, c.dangerLight], info: [c.primary, c.primaryLight], warning: [c.warning, c.warningLight] };
  const [color, background] = tones[toast.type] ?? tones.info;
  return <View style={[styles.container, { top: insets.top + 12 }]} pointerEvents="box-none">
    <Animated.View key={toast.id} accessibilityRole="alert" accessibilityLiveRegion="polite" entering={reduceMotion ? undefined : SlideInUp.duration(180)} exiting={reduceMotion ? undefined : FadeOutUp.duration(150)} style={[styles.toast, { width: Math.min(width - 24, 350), backgroundColor: c.surface, borderColor: c.border }]}>
      <View style={[styles.iconCircle, { backgroundColor: background }]}><Ionicons name={ICONS[toast.type] ?? ICONS.info} size={18} color={color} /></View>
      <Text style={[styles.text, { color: c.text.primary, fontFamily: theme.typography.family.medium, fontSize: fontScale >= 1.4 ? 13 : 12 }]}>{toast.message}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={() => remove(toast.id)} style={styles.close}><Ionicons name="close" size={16} color={c.text.secondary} /></Pressable>
    </Animated.View>
  </View>;
}
export function useToast() {
  const addToast = useUIStore(s => s.addToast);
  return { showToast: addToast, success: (msg: string) => addToast(msg, 'success'), error: (msg: string) => addToast(msg, 'error'), info: (msg: string) => addToast(msg, 'info'), warning: (msg: string) => addToast(msg, 'warning') };
}
const styles = StyleSheet.create({
  container: { position: 'absolute', left: 0, right: 0, zIndex: 9999, alignItems: 'center' },
  toast: { flexDirection: 'row', alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E4E9F2', backgroundColor: '#FFFFFF', paddingLeft: 12, paddingRight: 4, paddingVertical: 7, gap: 9, shadowColor: '#182338', shadowOffset: { width: 0, height: 2 }, shadowOpacity: .08, shadowRadius: 8, elevation: 3 },
  iconCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  text: { flex: 1, color: '#182338', lineHeight: 19 }, close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
});
