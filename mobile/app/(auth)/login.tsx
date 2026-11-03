import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, Pressable, ActivityIndicator, useWindowDimensions, StatusBar, TextInput } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withRepeat, cancelAnimation, interpolateColor } from 'react-native-reanimated';
import { router } from 'expo-router';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Haptics from 'expo-haptics';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { useGlassPreferences } from '@/components/glass/LiquidGlass';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { apiClient } from '@/api/client';
import { SecureStorage } from '@/lib/secureStorage';
import { sendPasswordReset } from '@/lib/passwordRecovery';
import { LoginInput } from '@/components/ui/LoginInput';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
interface FieldErrors { email?: string; password?: string; }
function validate(email: string, password: string): FieldErrors | null {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = 'Email is required';
  else if (!EMAIL_REGEX.test(email.trim())) errors.email = 'Enter a valid email address';
  if (!password) errors.password = 'Password is required';
  return Object.keys(errors).length ? errors : null;
}
function MedicalArtwork() {
  const { reduceMotion } = useGlassPreferences();
  const offset = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) { cancelAnimation(offset); offset.value = 0; return; }
    offset.value = withRepeat(withTiming(-5, { duration: 3600 }), -1, true);
    return () => cancelAnimation(offset);
  }, [reduceMotion, offset]);
  const animation = useAnimatedStyle(() => ({ transform: [{ translateY: offset.value }] }));
  return <Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.artwork, animation]}>
    <Animated.Image source={require('../../assets/images/login-pharmacist-realistic.png')} style={styles.pharmacist} resizeMode="contain" />
    <Animated.Image source={require('../../assets/images/login-medical-products-realistic.png')} style={styles.medicines} resizeMode="contain" />
  </Animated.View>;
}
export default function LoginScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const { reduceMotion } = useGlassPreferences();
  const { width, height, fontScale } = useWindowDimensions();
  const wide = width / fontScale >= 800;
  const passwordRef = useRef<TextInput>(null);
  const ink = isDark ? '#F2F5FC' : '#182338';
  const muted = isDark ? '#A9B5C9' : '#657087';
  const accent = isDark ? '#9DB7FF' : '#2457E6';
  const paper = isDark ? '#121B2C' : '#FFFFFF';
  const line = isDark ? '#354159' : '#DCE2EC';
  const fonts = theme.typography.family;
  const insets = useSafeAreaInsets();
  const saveTokens = useAuthStore(s => s.saveTokens);
  const setUser = useAuthStore(s => s.setUser);
  const addToast = useUIStore(s => s.addToast);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [apiError, setApiError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [buttonPressed, setButtonPressed] = useState(false);
  const buttonFill = useSharedValue(0);
  useEffect(() => { buttonFill.value = withTiming(hovered || buttonPressed ? 1 : 0, { duration: reduceMotion ? 0 : 180 }); }, [hovered, buttonPressed, reduceMotion, buttonFill]);
  const buttonAnimation = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(buttonFill.value, [0, 1], ['rgba(36,87,230,0)', '#2457E6']), borderColor: interpolateColor(buttonFill.value, [0, 1], [accent, '#2457E6']) }), [accent]);
  const buttonTextAnimation = useAnimatedStyle(() => ({ color: interpolateColor(buttonFill.value, [0, 1], [accent, '#FFFFFF']) }), [accent]);
  const triggerShake = useCallback(() => { void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}); }, []);
  const handleLogin = useCallback(async () => {
    if (isLoading) return;
    setApiError("");

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
      // 1. Authenticate with Express backend
      const { data: loginRes } = await apiClient.post<{
        success: boolean;
        data: {
          user: { id: string; email: string; name: string; role: string };
          clinic?: { id: string; name: string; plan: string };
          accessToken: string;
          refreshToken: string;
        };
        error?: string;
      }>("/auth/login", {
        email: email.trim(),
        password,
      });

      if (!loginRes.success || !loginRes.data?.accessToken) {
        throw new Error(loginRes.error || "Invalid email or password");
      }

      const {
        accessToken,
        refreshToken,
        user: backendUser,
        clinic,
      } = loginRes.data;

      // 2. Store tokens in SecureStorage
      await SecureStorage.setSessionPersistence(rememberMe);
      await saveTokens(accessToken, refreshToken);

      // 3. Store user profile
      setUser({
        id: backendUser.id,
        name: backendUser.name || email.split("@")[0],
        email: backendUser.email,
        role: backendUser.role,
        clinicId: clinic?.id ?? "",
      });

      addToast("Welcome back!", "success");
      router.replace("/(app)/(tabs)/dashboard");
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { error?: string } } };
      const message =
        axiosErr?.response?.data?.error ??
        (err instanceof Error ? err.message : "Login failed");
      setApiError(message);
      triggerShake();
    } finally {
      setIsLoading(false);
    }
  }, [email, password, saveTokens, setUser, addToast, triggerShake, isLoading, rememberMe]);

  /* ─── Biometric Handler ─────────────────────────────── */

  const handleBiometric = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    if (!hasHardware) {
      setApiError("Biometrics not available on this device");
      return;
    }

    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!isEnrolled) {
      setApiError("No biometrics enrolled on this device");
      return;
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Authenticate to access Nexsyrus",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });

    if (result.success) {
      const storedToken = await SecureStorage.getAccessToken();
      if (storedToken) {
        addToast("Biometric login successful", "success");
        router.replace("/(app)/(tabs)/dashboard");
      } else {
        setApiError(
          "No saved session. Please sign in with your password first.",
        );
      }
    }
  }, [addToast]);


  const handleSubmit = async () => {
    if (!resetMode) { await handleLogin(); return; }
    if (isLoading) return;
    if (!EMAIL_REGEX.test(email.trim())) { setFieldErrors({ email: 'Enter a valid email address' }); return; }
    setFieldErrors({}); setApiError(''); setIsLoading(true);
    try { await sendPasswordReset(email.trim()); setResetSent(true); }
    catch (error) { setApiError(error instanceof Error ? error.message : 'Could not send the reset link. Please retry.'); }
    finally { setIsLoading(false); }
  };
  return <View style={[styles.root, { backgroundColor: paper }]}>
    <StatusBar barStyle="light-content" backgroundColor="#2457E6" />
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <ScrollView contentContainerStyle={[styles.scroll, wide && styles.split]} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" bounces={false}>
        <View style={[styles.hero, { paddingTop: insets.top + 24, minHeight: fontScale >= 1.4 ? 310 : 265 }, wide && { width: '50%', minHeight: Math.max(height, 780), padding: 40 }]}>
          <View style={styles.brand}><View style={styles.brandMark}><Ionicons name="add" size={25} color="#FFFFFF" /></View><Text style={[styles.brandName, { fontFamily: fonts.bold }]}>Nexsyrus</Text></View>
          <View style={[styles.heroCopy, wide && { marginTop: 56 }]}>
            <Text style={[styles.eyebrow, { fontFamily: fonts.semiBold }]}>CARE STARTS HERE</Text>
            <Text style={[styles.heroTitle, { fontFamily: fonts.semiBold, fontSize: wide ? 46 : width < 360 ? 26 : 30, lineHeight: wide ? 56 : 37 }, wide && { maxWidth: '100%' }]}>Your pharmacy.{'\n'}In good hands.</Text>
            {wide && <Text style={[styles.heroDescription, { fontFamily: fonts.regular }]}>Billing, stock, and everyday care. Together.</Text>}
          </View>
          <View style={wide ? styles.wideArtwork : styles.phoneArtwork}><MedicalArtwork /></View>
        </View>
        <View style={[styles.entry, wide && { width: '50%', justifyContent: 'center', paddingHorizontal: 40 }, { paddingBottom: insets.bottom + 24 }]}>
          <View style={styles.entryTop}><Text style={[styles.secure, { color: muted, fontFamily: fonts.regular }]}>Secure workspace</Text><Pressable onPress={toggleTheme} accessibilityRole="button" accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`} style={[styles.themeToggle, { borderColor: line }]}><Ionicons name={isDark ? 'sunny-outline' : 'moon-outline'} size={18} color={muted} /></Pressable></View>
          <View style={styles.form}>
            <View style={styles.formBrand}><View style={[styles.formMark, { backgroundColor: accent }]}><Ionicons name="add" size={23} color={paper} /></View><Text style={{ color: ink, fontFamily: fonts.bold, fontSize: 18 }}>Nexsyrus</Text></View>
            <Text accessibilityRole="header" style={[styles.heading, { color: ink, fontFamily: fonts.bold }]}>{resetMode ? 'Forgot password?' : 'Welcome back'}</Text>
            <Text style={[styles.description, { color: muted, fontFamily: fonts.regular }]}>{resetMode ? 'Enter your email to receive a password reset link.' : 'Sign in to your pharmacy workspace.'}</Text>
            <LoginInput testID="login-email" label="Email address" icon="mail-outline" value={email} onChangeText={text => { setEmail(text); setFieldErrors({}); setApiError(''); setResetSent(false); }} error={fieldErrors.email} keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" placeholder="you@pharmacy.com" returnKeyType={resetMode ? 'go' : 'next'} onSubmitEditing={() => resetMode ? void handleSubmit() : passwordRef.current?.focus()} editable={!isLoading} />
            {!resetMode && <LoginInput ref={passwordRef} testID="login-password" label="Password" icon="lock-closed-outline" value={password} onChangeText={text => { setPassword(text); setFieldErrors({}); setApiError(''); }} error={fieldErrors.password} secureTextEntry autoCapitalize="none" autoComplete="current-password" textContentType="password" placeholder="Enter your password" returnKeyType="go" onSubmitEditing={handleSubmit} editable={!isLoading} />}
            {resetMode ? <Pressable accessibilityRole="button" onPress={() => { setResetMode(false); setResetSent(false); setApiError(''); }} style={styles.textButton}><Text style={{ color: accent, fontFamily: fonts.semiBold, fontSize: 12 }}>Back to login</Text></Pressable> : <View style={styles.options}>
              <Pressable accessibilityRole="checkbox" accessibilityLabel="Remember me" accessibilityState={{ checked: rememberMe, disabled: isLoading }} disabled={isLoading} onPress={() => setRememberMe(!rememberMe)} style={styles.remember}><Ionicons name={rememberMe ? 'checkbox' : 'square-outline'} size={19} color={accent} /><Text style={{ color: muted, fontFamily: fonts.regular, fontSize: 12 }}>Remember me</Text></Pressable>
              <Pressable accessibilityRole="button" disabled={isLoading} onPress={() => { setResetMode(true); setApiError(''); setFieldErrors({}); }} style={styles.textButton}><Text style={{ color: accent, fontFamily: fonts.semiBold, fontSize: 12 }}>Forgot password?</Text></Pressable>
            </View>}
            {resetSent && <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: theme.colors.successLight, borderColor: theme.colors.success }]}><Text style={{ color: theme.colors.success, fontFamily: fonts.regular, fontSize: 12, lineHeight: 19 }}>If an account exists for this email, a reset link is on its way.</Text></View>}
            {!!apiError && <View accessibilityRole="alert" style={[styles.feedback, { backgroundColor: theme.colors.dangerLight, borderColor: theme.colors.danger }]}><Text style={{ color: theme.colors.danger, fontFamily: fonts.medium, fontSize: 12, lineHeight: 19 }}>{apiError}</Text></View>}
            <AnimatedPressable testID="login-submit" accessibilityRole="button" accessibilityLabel={resetMode ? 'Send reset link' : 'Login'} accessibilityState={{ disabled: isLoading, busy: isLoading }} disabled={isLoading} onHoverIn={() => setHovered(true)} onHoverOut={() => setHovered(false)} onPress={handleSubmit} onPressIn={() => setButtonPressed(true)} onPressOut={() => setButtonPressed(false)} style={[styles.submit, buttonAnimation, { opacity: isLoading ? .6 : 1 }]}>
              {({ pressed }) => <>{isLoading && <ActivityIndicator size="small" color={hovered || pressed ? '#FFFFFF' : accent} />}<Animated.Text style={[{ fontFamily: fonts.semiBold, fontSize: 13 }, buttonTextAnimation]}>{isLoading ? (resetMode ? 'Sending reset link…' : 'Signing you in…') : resetMode ? 'Send reset link' : 'Login'}</Animated.Text>{!isLoading && <Ionicons name="arrow-forward" size={18} color={hovered || pressed ? '#FFFFFF' : accent} />}</>}
            </AnimatedPressable>
            {Platform.OS !== 'web' && !resetMode && <Pressable accessibilityRole="button" accessibilityLabel="Sign in with biometrics" disabled={isLoading} onPress={handleBiometric} style={[styles.biometric, { borderColor: line }]}><Ionicons name="finger-print" size={21} color={accent} /><Text style={{ color: ink, fontFamily: fonts.medium, fontSize: 12 }}>Sign in with biometrics</Text></Pressable>}
          </View>
          <Text style={[styles.footer, { color: muted, fontFamily: fonts.regular }]}>Your pharmacy. Connected.</Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </View>;
}
const styles = StyleSheet.create({
  root: { flex: 1 }, scroll: { flexGrow: 1 }, split: { flexDirection: 'row' },
  hero: { backgroundColor: '#2457E6', overflow: 'hidden', paddingHorizontal: 24, paddingBottom: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandMark: { width: 33, height: 33, borderWidth: 1, borderColor: '#FFFFFFB3', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, brandName: { color: '#FFFFFF', fontSize: 21, letterSpacing: -.6 },
  heroCopy: { marginTop: 29 }, eyebrow: { color: '#D7E3FF', fontSize: 8, letterSpacing: 1.6 }, heroTitle: { color: '#FFFFFF', marginTop: 14, letterSpacing: -1, maxWidth: '60%' }, heroDescription: { color: '#E2EAFF', fontSize: 13, lineHeight: 22, marginTop: 14 },
  phoneArtwork: { position: 'absolute', right: 0, bottom: -4, width: '44%', height: 220 }, wideArtwork: { width: '100%', maxWidth: 440, height: 410, alignSelf: 'center', marginTop: 32 }, artwork: { flex: 1 }, pharmacist: { width: '100%', height: '100%' }, medicines: { position: 'absolute', width: '40%', height: '40%', right: '5%', bottom: '2%' },
  entry: { paddingHorizontal: 24, paddingTop: 18, flexGrow: 1 }, entryTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 26 }, secure: { fontSize: 11 }, themeToggle: { width: 36, height: 36, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  form: { width: '100%', maxWidth: 400, alignSelf: 'center' }, formBrand: { flexDirection: 'row', alignItems: 'center', gap: 9, marginBottom: 24 }, formMark: { width: 30, height: 30, borderRadius: 7, justifyContent: 'center', alignItems: 'center' }, heading: { fontSize: 28, lineHeight: 38, letterSpacing: -1 }, description: { fontSize: 12, lineHeight: 20, marginTop: 8, marginBottom: 28 },
  options: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }, remember: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44 }, textButton: { minHeight: 44, justifyContent: 'center' }, submit: { borderWidth: 1.5, borderRadius: 8, minHeight: 48, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  feedback: { borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 14 }, biometric: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, borderRadius: 8, borderWidth: 1, marginTop: 16 }, footer: { fontSize: 10, textAlign: 'center', paddingTop: 32 },
});
