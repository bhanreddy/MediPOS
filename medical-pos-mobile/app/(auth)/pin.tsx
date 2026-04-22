import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, StatusBar } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  withDelay,
  FadeIn,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
// Removed expo-crypto to fix Expo Go missing module error
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import {
  getStorageString,
  setStorageString,
  deleteStorageKey,
} from '@/utils/storage';
import { getInitials } from '@/utils/format';

const PIN_LENGTH = 4;
const MAX_ATTEMPTS = 5;
const PIN_HASH_KEY = 'pin_hash';

/* ─── Greeting Helper ───────────────────────────────── */

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/* ─── Hash Helper ───────────────────────────────────── */

async function hashPin(pin: string): Promise<string> {
  // Just use the raw pin for Expo Go to avoid missing btoa/crypto modules
  return Promise.resolve(pin);
}

/* ─── Types ─────────────────────────────────────────── */

type Mode = 'verify' | 'set' | 'confirm';

/* ─── Screen ────────────────────────────────────────── */

export default function PinScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const addToast = useUIStore((s) => s.addToast);

  const [pin, setPin] = useState('');
  const [mode, setMode] = useState<Mode>('verify');
  const [firstPin, setFirstPin] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [statusText, setStatusText] = useState('');

  const shakeX = useSharedValue(0);
  const dotScales = [
    useSharedValue(0.85),
    useSharedValue(0.85),
    useSharedValue(0.85),
    useSharedValue(0.85),
  ];

  // Animate dots filling in
  useEffect(() => {
    dotScales.forEach((scale, i) => {
      if (i < pin.length) {
        scale.value = withSpring(1, { damping: 12, stiffness: 200 });
      } else {
        scale.value = withTiming(0.85, { duration: 120 });
      }
    });
  }, [pin.length]);

  // Check if PIN is set
  useEffect(() => {
    const existingHash = getStorageString(PIN_HASH_KEY);
    if (!existingHash) {
      setMode('set');
      setStatusText('Create a 4-digit PIN');
    } else {
      setMode('verify');
      setStatusText('');
    }
  }, []);

  /* ─── Shake Animation ──────────────────────────────── */

  const triggerShake = useCallback(() => {
    shakeX.value = withSequence(
      withTiming(-12, { duration: 50 }),
      withTiming(12, { duration: 50 }),
      withTiming(-8, { duration: 50 }),
      withTiming(8, { duration: 50 }),
      withTiming(-4, { duration: 50 }),
      withTiming(0, { duration: 50 }),
    );
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [shakeX]);

  const dotsShakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  /* ─── PIN Verification ─────────────────────────────── */

  const handlePinComplete = useCallback(
    async (enteredPin: string) => {
      if (mode === 'set') {
        // First entry — save and ask to confirm
        setFirstPin(enteredPin);
        setMode('confirm');
        setStatusText('Confirm your PIN');
        setPin('');
        return;
      }

      if (mode === 'confirm') {
        // Compare with first entry
        if (enteredPin === firstPin) {
          const hash = await hashPin(enteredPin);
          setStorageString(PIN_HASH_KEY, hash);
          addToast('PIN set successfully', 'success');
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.replace('/(app)/(tabs)/dashboard');
        } else {
          triggerShake();
          setStatusText('PINs didn\'t match. Try again.');
          setMode('set');
          setFirstPin('');
          setTimeout(() => setPin(''), 300);
        }
        return;
      }

      // mode === 'verify'
      const storedHash = getStorageString(PIN_HASH_KEY);
      const enteredHash = await hashPin(enteredPin);

      if (enteredHash === storedHash) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        addToast('PIN Verified', 'success');
        router.replace('/(app)/(tabs)/dashboard');
      } else {
        const nextAttempts = attempts + 1;
        setAttempts(nextAttempts);
        triggerShake();

        if (nextAttempts >= MAX_ATTEMPTS) {
          addToast('Too many failed attempts. Please sign in again.', 'error');
          deleteStorageKey(PIN_HASH_KEY);
          logout();
          router.replace('/(auth)/login');
          return;
        }

        setStatusText(`Wrong PIN. ${MAX_ATTEMPTS - nextAttempts} attempts remaining.`);
        setTimeout(() => setPin(''), 300);
      }
    },
    [mode, firstPin, attempts, addToast, triggerShake, logout],
  );

  // Trigger on pin full
  useEffect(() => {
    if (pin.length === PIN_LENGTH) {
      handlePinComplete(pin);
    }
  }, [pin, handlePinComplete]);

  /* ─── Key Press ─────────────────────────────────────── */

  const handleKeyPress = useCallback(
    (key: string) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      if (pin.length < PIN_LENGTH) {
        setPin((prev) => prev + key);
      }
    },
    [pin.length],
  );

  const handleBackspace = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPin((prev) => prev.slice(0, -1));
  }, []);

  /* ─── Biometric ─────────────────────────────────────── */

  const handleBiometric = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) return;

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) return;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access MedPOS',
      cancelLabel: 'Cancel',
    });

    if (result.success) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      addToast('Biometric login successful', 'success');
      router.replace('/(app)/(tabs)/dashboard');
    }
  }, [addToast]);

  /* ─── Render Helpers ────────────────────────────────── */

  const userName = user?.name ?? 'User';
  const initials = getInitials(userName);
  const greeting = getGreeting();

  const headingText = mode === 'verify' ? 'Enter PIN' : mode === 'set' ? 'Set your PIN' : 'Confirm PIN';

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.background,
          paddingTop: insets.top + 40,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <StatusBar barStyle="dark-content" backgroundColor={theme.colors.background} />

      {/* ─── User Info ────────────────────────────── */}
      <Animated.View style={styles.userSection} entering={FadeIn.duration(300)}>
        <View
          style={[
            styles.avatar,
            { backgroundColor: theme.colors.primaryLight },
          ]}
        >
          <Text
            style={[
              styles.avatarText,
              {
                color: theme.colors.primary,
                fontFamily: theme.typography.family.bold,
                fontSize: theme.typography.size.xl,
              },
            ]}
          >
            {initials}
          </Text>
        </View>

        <Text
          style={[
            styles.greeting,
            {
              color: theme.colors.text.secondary,
              fontFamily: theme.typography.family.regular,
              fontSize: theme.typography.size.base,
            },
          ]}
        >
          {greeting}
        </Text>

        <Text
          style={[
            styles.userName,
            {
              color: theme.colors.text.primary,
              fontFamily: theme.typography.family.bold,
              fontSize: theme.typography.size.xl,
            },
          ]}
        >
          {userName}
        </Text>
      </Animated.View>

      {/* ─── Heading ──────────────────────────────── */}
      <Text
        style={[
          styles.heading,
          {
            color: theme.colors.text.primary,
            fontFamily: theme.typography.family.semiBold,
            fontSize: theme.typography.size.lg,
          },
        ]}
      >
        {headingText}
      </Text>

      {/* ─── Dots ─────────────────────────────────── */}
      <Animated.View style={[styles.dotsRow, dotsShakeStyle]}>
        {Array.from({ length: PIN_LENGTH }).map((_, i) => {
          const isFilled = pin.length > i;
          const animStyle = useAnimatedStyle(() => ({
            transform: [{ scale: dotScales[i].value }],
          }));

          return (
            <Animated.View
              key={i}
              style={[
                styles.dot,
                animStyle,
                {
                  backgroundColor: isFilled ? theme.colors.primary : 'transparent',
                  borderColor: isFilled ? theme.colors.primary : theme.colors.border,
                },
              ]}
            />
          );
        })}
      </Animated.View>

      {/* Status text */}
      {statusText ? (
        <Text
          style={[
            styles.statusText,
            {
              color:
                statusText.includes('Wrong') || statusText.includes('didn\'t')
                  ? theme.colors.danger
                  : theme.colors.text.secondary,
              fontFamily: theme.typography.family.regular,
              fontSize: theme.typography.size.sm,
            },
          ]}
        >
          {statusText}
        </Text>
      ) : null}

      {/* ─── Numeric Keypad ───────────────────────── */}
      <View style={styles.keypadContainer}>
        {[
          ['1', '2', '3'],
          ['4', '5', '6'],
          ['7', '8', '9'],
          ['biometric', '0', 'delete'],
        ].map((row, rowIndex) => (
          <View key={rowIndex} style={styles.keypadRow}>
            {row.map((item) => {
              if (item === 'delete') {
                return (
                  <KeypadButton
                    key={item}
                    onPress={handleBackspace}
                    theme={theme}
                  >
                    <Ionicons
                      name="backspace-outline"
                      size={26}
                      color={theme.colors.text.primary}
                    />
                  </KeypadButton>
                );
              }

              if (item === 'biometric') {
                return (
                  <KeypadButton
                    key={item}
                    onPress={handleBiometric}
                    theme={theme}
                    transparent
                  >
                    <Ionicons
                      name="finger-print"
                      size={28}
                      color={theme.colors.primary}
                    />
                  </KeypadButton>
                );
              }

              return (
                <KeypadButton
                  key={item}
                  onPress={() => handleKeyPress(item)}
                  theme={theme}
                >
                  <Text
                    style={[
                      styles.keyText,
                      {
                        color: theme.colors.text.primary,
                        fontFamily: theme.typography.family.medium,
                        fontSize: theme.typography.size.xxl,
                      },
                    ]}
                  >
                    {item}
                  </Text>
                </KeypadButton>
              );
            })}
          </View>
        ))}
      </View>

      {/* ─── Password Link ────────────────────────── */}
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.replace('/(auth)/login');
        }}
        style={styles.passwordLink}
      >
        <Text
          style={[
            styles.passwordLinkText,
            {
              color: theme.colors.primary,
              fontFamily: theme.typography.family.medium,
              fontSize: theme.typography.size.sm,
            },
          ]}
        >
          Sign in with password
        </Text>
      </Pressable>
    </View>
  );
}

/* ─── Keypad Button Component ───────────────────────── */

interface KeypadButtonProps {
  children: React.ReactNode;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>['theme'];
  transparent?: boolean;
}

function KeypadButton({ children, onPress, theme, transparent = false }: KeypadButtonProps) {
  const scale = useSharedValue(1);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 15, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 15, stiffness: 300 });
  };

  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View
        style={[
          styles.key,
          animStyle,
          {
            backgroundColor: transparent ? 'transparent' : theme.colors.surface,
            borderColor: transparent ? 'transparent' : theme.colors.border,
            borderWidth: transparent ? 0 : 0.5,
          },
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}

/* ─── Styles ────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
  },

  /* User section */
  userSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {},
  greeting: {
    marginBottom: 2,
  },
  userName: {},

  /* Heading */
  heading: {
    marginBottom: 24,
  },

  /* Dots */
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 8,
    gap: 20,
  },
  dot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
  },

  /* Status */
  statusText: {
    marginTop: 8,
    marginBottom: 16,
    textAlign: 'center',
    paddingHorizontal: 32,
  },

  /* Keypad */
  keypadContainer: {
    flex: 1,
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 40,
    maxWidth: 320,
  },
  keypadRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  key: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyText: {},

  /* Password link */
  passwordLink: {
    paddingVertical: 12,
  },
  passwordLinkText: {},
});
