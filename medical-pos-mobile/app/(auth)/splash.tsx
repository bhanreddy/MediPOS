import React, { useEffect } from 'react';
import { View, StyleSheet, StatusBar } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import Svg, { Rect } from 'react-native-svg';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';

/* ─── Medical Cross Logo ────────────────────────────── */

function MedicalCross({ size = 80, color = '#FFFFFF' }: { size?: number; color?: string }) {
  const arm = size * 0.3; // arm width
  const offset = (size - arm) / 2;
  const r = arm * 0.2; // rounded corners

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {/* Vertical bar */}
      <Rect x={offset} y={0} width={arm} height={size} rx={r} ry={r} fill={color} />
      {/* Horizontal bar */}
      <Rect x={0} y={offset} width={size} height={arm} rx={r} ry={r} fill={color} />
    </Svg>
  );
}

/* ─── Screen ────────────────────────────────────────── */

export default function SplashScreen() {
  const { theme } = useTheme();

  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.8);
  const textOpacity = useSharedValue(0);
  const subtitleOpacity = useSharedValue(0);

  const navigateAway = async () => {
    await useAuthStore.getState().hydrateAuthFromSecureStorage();
    const token = useAuthStore.getState().token;
    if (token) {
      router.replace('/(auth)/pin');
    } else {
      router.replace('/(auth)/login');
    }
  };

  useEffect(() => {
    // Logo fade + scale
    opacity.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });
    scale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) });

    // App name with slight delay
    textOpacity.value = withDelay(200, withTiming(1, { duration: 400 }));

    // Subtitle with more delay
    subtitleOpacity.value = withDelay(400, withTiming(1, { duration: 400 }));

    // Navigate after 1800ms
    const timeout = setTimeout(() => {
      void navigateAway();
    }, 1800);

    return () => clearTimeout(timeout);
  }, []);

  const logoAnimStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const titleAnimStyle = useAnimatedStyle(() => ({
    opacity: textOpacity.value,
  }));

  const subtitleAnimStyle = useAnimatedStyle(() => ({
    opacity: subtitleOpacity.value,
  }));

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.primary }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primary} />

      <Animated.View style={[styles.logoContainer, logoAnimStyle]}>
        <MedicalCross size={80} color="#FFFFFF" />
      </Animated.View>

      <Animated.Text
        style={[
          styles.appName,
          titleAnimStyle,
          {
            fontFamily: theme.typography.family.bold,
            fontSize: theme.typography.size.display,
          },
        ]}
      >
        MedPOS
      </Animated.Text>

      <Animated.Text
        style={[
          styles.tagline,
          subtitleAnimStyle,
          {
            fontFamily: theme.typography.family.regular,
            fontSize: theme.typography.size.base,
          },
        ]}
      >
        Pharmacy Management
      </Animated.Text>
    </View>
  );
}

/* ─── Styles ────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    marginBottom: 20,
  },
  appName: {
    color: '#FFFFFF',
    marginBottom: 6,
  },
  tagline: {
    color: 'rgba(255,255,255,0.7)',
  },
});
