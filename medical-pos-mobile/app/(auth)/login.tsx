import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  withSpring,
  FadeIn,
  SlideInDown,
} from 'react-native-reanimated';
import { router } from 'expo-router';
import Svg, { Rect } from 'react-native-svg';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { apiClient } from '@/api/client';
import { setSecureRefreshToken } from '@/utils/secureAuthToken';
import { FloatingInput } from '@/components/ui/FloatingInput';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = SCREEN_HEIGHT * 0.38;

/* ─── Watermark Cross ───────────────────────────────── */

function WatermarkCross() {
  const size = 200;
  const arm = size * 0.3;
  const offset = (size - arm) / 2;
  const r = arm * 0.2;

  return (
    <View style={styles.watermark}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Rect x={offset} y={0} width={arm} height={size} rx={r} ry={r} fill="rgba(255,255,255,0.08)" />
        <Rect x={0} y={offset} width={size} height={arm} rx={r} ry={r} fill="rgba(255,255,255,0.08)" />
      </Svg>
    </View>
  );
}

/* ─── Validation ────────────────────────────────────── */

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors | null {
  const errors: FieldErrors = {};

  if (!email.trim()) {
    errors.email = 'Email is required';
  } else if (!EMAIL_REGEX.test(email.trim())) {
    errors.email = 'Enter a valid email address';
  }

  if (!password) {
    errors.password = 'Password is required';
  } else if (password.length < 6) {
    errors.password = 'Password must be at least 6 characters';
  }

  return Object.keys(errors).length > 0 ? errors : null;
}

/* ─── Screen ────────────────────────────────────────── */

export default function LoginScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const setToken = useAuthStore((s) => s.setToken);
  const setUser = useAuthStore((s) => s.setUser);
  const logout = useAuthStore((s) => s.logout);
  const addToast = useUIStore((s) => s.addToast);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Shake animation for error
  const shakeX = useSharedValue(0);
  const cardAnimStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

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

  /* ─── Login Handler ─────────────────────────────────── */

  const handleLogin = useCallback(async () => {
    setApiError('');

    const validationErrors = validate(email, password);
    if (validationErrors) {
      setFieldErrors(validationErrors);
      triggerShake();
      return;
    }

    setFieldErrors({});
    setIsLoading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
      const SUPABASE_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

      // 1. Authenticate with Supabase REST
      const authRes = await fetch(
        `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: SUPABASE_ANON,
          },
          body: JSON.stringify({ email: email.trim(), password }),
        },
      );

      const authData = (await authRes.json()) as Record<string, unknown>;

      if (!authRes.ok) {
        const msg =
          (authData.error_description as string) ??
          (authData.msg as string) ??
          'Invalid email or password';
        throw new Error(msg);
      }

      const accessToken = authData.access_token as string;
      const refreshToken =
        typeof authData.refresh_token === 'string' ? authData.refresh_token : undefined;

      // 2. Store tokens (refresh enables silent Supabase rotation on API 401)
      setToken(accessToken);
      if (refreshToken) {
        await setSecureRefreshToken(refreshToken);
      }

      // 3. Fetch user profile from Express backend
      let userName = '';
      let userEmail = email.trim();
      let clinicId = '';
      let role = 'STAFF';
      let userId = '';

      try {
        const meRes = await apiClient.get<{
          user?: {
            id?: string;
            name?: string;
            email?: string;
            clinic_id?: string;
            clinicId?: string;
            role?: string;
            user_role?: string;
          };
        }>('/auth/me');
        const me = meRes.data?.user ?? (meRes.data as Record<string, unknown>);
        userId = (me?.id as string) ?? '';
        userName = (me?.name as string) ?? '';
        userEmail = (me?.email as string) ?? userEmail;
        clinicId = (me?.clinic_id as string) ?? (me?.clinicId as string) ?? '';
        role = (me?.role as string) ?? (me?.user_role as string) ?? 'STAFF';
      } catch {
        // User may not have a backend row yet — proceed anyway
      }

      // 4. Store user
      setUser({
        id: userId,
        name: userName || email.split('@')[0],
        email: userEmail,
        role,
        clinicId,
      });

      addToast('Welcome back!', 'success');
      router.replace('/(app)/(tabs)/dashboard');
    } catch (err: unknown) {
      logout();
      const message = err instanceof Error ? err.message : 'Login failed';
      setApiError(message);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  }, [email, password, setToken, setUser, logout, addToast, triggerShake]);

  /* ─── Biometric Handler ─────────────────────────────── */

  const handleBiometric = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      setApiError('Biometrics not available on this device');
      return;
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      setApiError('No biometrics enrolled on this device');
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to access MedPOS',
      cancelLabel: 'Cancel',
      disableDeviceFallback: false,
    });

    if (result.success) {
      const { getSecureAuthToken } = await import('@/utils/secureAuthToken');
      const storedToken = await getSecureAuthToken();
      if (storedToken) {
        addToast('Biometric login successful', 'success');
        router.replace('/(app)/(tabs)/dashboard');
      } else {
        setApiError('No saved session. Please sign in with your password first.');
      }
    }
  }, [addToast]);

  /* ─── Field Change Handlers ─────────────────────────── */

  const handleEmailChange = useCallback(
    (text: string) => {
      setEmail(text);
      if (fieldErrors.email) {
        setFieldErrors((prev) => ({ ...prev, email: undefined }));
      }
      if (apiError) setApiError('');
    },
    [fieldErrors.email, apiError],
  );

  const handlePasswordChange = useCallback(
    (text: string) => {
      setPassword(text);
      if (fieldErrors.password) {
        setFieldErrors((prev) => ({ ...prev, password: undefined }));
      }
      if (apiError) setApiError('');
    },
    [fieldErrors.password, apiError],
  );

  return (
    <View style={[styles.root, { backgroundColor: theme.colors.background }]}>
      <StatusBar barStyle="light-content" backgroundColor={theme.colors.primary} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          bounces={false}
        >
          {/* ─── Top Colored Panel ───────────────────── */}
          <View
            style={[
              styles.topPanel,
              {
                backgroundColor: theme.colors.primary,
                height: PANEL_HEIGHT,
                paddingTop: insets.top + 24,
              },
            ]}
          >
            <WatermarkCross />
            <Animated.View entering={FadeIn.duration(400).delay(100)}>
              <Text
                style={[
                  styles.panelTitle,
                  {
                    fontFamily: theme.typography.family.bold,
                    fontSize: theme.typography.size.xxxl,
                  },
                ]}
              >
                MedPOS
              </Text>
              <Text
                style={[
                  styles.panelSubtitle,
                  {
                    fontFamily: theme.typography.family.regular,
                    fontSize: theme.typography.size.base,
                  },
                ]}
              >
                Pharmacy Management System
              </Text>
            </Animated.View>
          </View>

          {/* ─── White Card ──────────────────────────── */}
          <Animated.View
            style={[
              styles.card,
              cardAnimStyle,
              {
                backgroundColor: theme.colors.surface,
                ...theme.shadow.card,
              },
            ]}
            entering={SlideInDown.duration(400).delay(200).springify().damping(18)}
          >
            <Text
              style={[
                styles.cardTitle,
                {
                  color: theme.colors.text.primary,
                  fontFamily: theme.typography.family.bold,
                  fontSize: theme.typography.size.xxxl,
                },
              ]}
            >
              Welcome back
            </Text>
            <Text
              style={[
                styles.cardSubtitle,
                {
                  color: theme.colors.text.secondary,
                  fontFamily: theme.typography.family.regular,
                  fontSize: theme.typography.size.base,
                },
              ]}
            >
              Sign in to your pharmacy
            </Text>

            {/* ─── Inputs ───────────────────────────── */}
            <FloatingInput
              testID="login-email"
              label="Email Address"
              value={email}
              onChangeText={handleEmailChange}
              error={fieldErrors.email}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <FloatingInput
              testID="login-password"
              label="Password"
              value={password}
              onChangeText={handlePasswordChange}
              error={fieldErrors.password}
              secureTextEntry
            />

            {/* Forgot password */}
            <Pressable
              style={styles.forgotRow}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                addToast('Password reset coming soon', 'info');
              }}
            >
              <Text
                style={[
                  styles.forgotText,
                  {
                    color: theme.colors.primary,
                    fontFamily: theme.typography.family.medium,
                    fontSize: theme.typography.size.sm,
                  },
                ]}
              >
                Forgot password?
              </Text>
            </Pressable>

            {/* ─── API Error ─────────────────────────── */}
            {apiError ? (
              <View
                style={[
                  styles.apiErrorContainer,
                  { backgroundColor: theme.colors.dangerLight, borderRadius: theme.radius.input },
                ]}
              >
                <Ionicons name="alert-circle" size={16} color={theme.colors.danger} />
                <Text
                  style={[
                    styles.apiErrorText,
                    {
                      color: theme.colors.danger,
                      fontFamily: theme.typography.family.medium,
                      fontSize: theme.typography.size.sm,
                    },
                  ]}
                >
                  {apiError}
                </Text>
              </View>
            ) : null}

            {/* ─── Sign In Button ────────────────────── */}
            <Pressable
              testID="login-submit"
              onPress={handleLogin}
              disabled={isLoading}
              style={({ pressed }) => [
                styles.primaryButton,
                {
                  backgroundColor: theme.colors.primary,
                  borderRadius: theme.radius.modal,
                  opacity: pressed || isLoading ? 0.85 : 1,
                },
              ]}
            >
              {isLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text
                  style={[
                    styles.primaryButtonText,
                    {
                      fontFamily: theme.typography.family.semiBold,
                      fontSize: theme.typography.size.lg,
                    },
                  ]}
                >
                  Sign In
                </Text>
              )}
            </Pressable>

            {/* ─── Divider ───────────────────────────── */}
            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
              <Text
                style={[
                  styles.dividerText,
                  {
                    color: theme.colors.text.tertiary,
                    fontFamily: theme.typography.family.regular,
                    fontSize: theme.typography.size.sm,
                  },
                ]}
              >
                or continue with
              </Text>
              <View style={[styles.dividerLine, { backgroundColor: theme.colors.border }]} />
            </View>

            {/* ─── Biometric Button ──────────────────── */}
            <Pressable
              testID="login-biometric"
              onPress={handleBiometric}
              style={({ pressed }) => [
                styles.biometricButton,
                {
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.modal,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}
            >
              <Ionicons
                name="finger-print"
                size={22}
                color={theme.colors.primary}
                style={styles.biometricIcon}
              />
              <Text
                style={[
                  styles.biometricText,
                  {
                    color: theme.colors.text.primary,
                    fontFamily: theme.typography.family.semiBold,
                    fontSize: theme.typography.size.base,
                  },
                ]}
              >
                Use Biometrics
              </Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

/* ─── Styles ────────────────────────────────────────── */

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },

  /* Top panel */
  topPanel: {
    justifyContent: 'flex-end',
    paddingHorizontal: 32,
    paddingBottom: 56,
    overflow: 'hidden',
  },
  panelTitle: {
    color: '#FFFFFF',
    marginBottom: 4,
  },
  panelSubtitle: {
    color: 'rgba(255,255,255,0.7)',
  },
  watermark: {
    position: 'absolute',
    top: -20,
    right: -30,
    opacity: 1,
  },

  /* Card */
  card: {
    marginTop: -28,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 32,
    paddingTop: 32,
    paddingBottom: 40,
    flex: 1,
  },
  cardTitle: {
    marginBottom: 4,
  },
  cardSubtitle: {
    marginBottom: 32,
  },

  /* Forgot password */
  forgotRow: {
    alignSelf: 'flex-end',
    marginBottom: 20,
    marginTop: -4,
  },
  forgotText: {},

  /* API Error */
  apiErrorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 16,
    gap: 8,
  },
  apiErrorText: {
    flex: 1,
  },

  /* Primary button */
  primaryButton: {
    height: 56,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  primaryButtonText: {
    color: '#FFFFFF',
  },

  /* Divider */
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    paddingHorizontal: 16,
  },

  /* Biometric */
  biometricButton: {
    height: 56,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  biometricIcon: {
    marginRight: 10,
  },
  biometricText: {},
});
