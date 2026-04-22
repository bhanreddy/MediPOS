import React from 'react';
import { StyleSheet, Text, View, Dimensions } from 'react-native';
import Animated, {
  FadeInUp,
  FadeOutUp,
  SlideInUp,
  SlideOutUp,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { useUIStore, type ToastType } from '@/stores/uiStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ICON_MAP: Record<ToastType, { name: keyof typeof Ionicons.glyphMap; color: string; bg: string }> = {
  success: { name: 'checkmark-circle', color: '#38A169', bg: '#EAF3DE' },
  error: { name: 'close-circle', color: '#E53E3E', bg: '#FCEBEB' },
  info: { name: 'information-circle', color: '#0066CC', bg: '#E6F1FB' },
  warning: { name: 'alert-circle', color: '#F6AD55', bg: '#FAEEDA' },
};

export const ToastProvider: React.FC = () => {
  const toasts = useUIStore(s => s.toasts);
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  const toast = toasts[0]; // FIFO — show one at a time
  const icon = ICON_MAP[toast.type] || ICON_MAP.info;

  return (
    <View
      style={[styles.container, { top: insets.top + 12 }]}
      pointerEvents="box-none"
    >
      <Animated.View
        key={toast.id}
        entering={SlideInUp.springify().damping(18).stiffness(200)}
        exiting={FadeOutUp.duration(250)}
        style={[
          styles.toast,
          {
            backgroundColor: theme.colors.surface,
            ...theme.shadow.modal,
            width: SCREEN_WIDTH - 48,
          },
        ]}
      >
        <View style={[styles.iconCircle, { backgroundColor: icon.bg }]}>
          <Ionicons name={icon.name} size={20} color={icon.color} />
        </View>
        <Text
          style={[
            styles.text,
            {
              color: theme.colors.text.primary,
              fontFamily: theme.typography.family.medium,
            },
          ]}
          numberOfLines={2}
        >
          {toast.message}
        </Text>
      </Animated.View>
    </View>
  );
};

/* ─── useToast convenience hook ─────────────────────── */

export function useToast() {
  const addToast = useUIStore(s => s.addToast);
  return {
    showToast: addToast,
    success: (msg: string) => addToast(msg, 'success'),
    error: (msg: string) => addToast(msg, 'error'),
    info: (msg: string) => addToast(msg, 'info'),
    warning: (msg: string) => addToast(msg, 'warning'),
  };
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 9999,
    alignItems: 'center',
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});
