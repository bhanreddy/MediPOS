import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, ActivityIndicator, StyleSheet, ScrollView } from 'react-native';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';
import { LoginInput } from '@/components/ui/LoginInput';
import { openPasswordResetLink, updateRecoveredPassword } from '@/lib/passwordRecovery';

export default function ResetPassword() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState('');
  const url = Linking.useURL();
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    setChecking(true);
    void openPasswordResetLink(url).then(() => { if (!cancelled) { setReady(true); setError(''); } }).catch(err => { if (!cancelled) { setReady(false); setError(err instanceof Error ? err.message : 'Reset link could not be opened.'); } }).finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [url]);
  useEffect(() => {
    if (!url) { setChecking(false); setError('Open the password reset link from your email.'); }
  }, [url]);
  const submit = async () => {
    if (saving) return;
    if (password.length < 8) { setError('Use at least 8 characters.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setSaving(true); setError('');
    try { await updateRecoveredPassword(password); setComplete(true); }
    catch (err) { setError(err instanceof Error ? err.message : 'Password could not be updated.'); }
    finally { setSaving(false); }
  };
  return <ScrollView style={{ backgroundColor: theme.colors.surface }} contentContainerStyle={[s.page, { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 24 }]} keyboardShouldPersistTaps="handled">
    <View style={s.content}><Text style={[s.brand, { fontFamily: theme.typography.family.bold }]}>✚ Nexsyrus</Text><Text accessibilityRole="header" style={[s.heading, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>Reset your password</Text>
      {checking ? <ActivityIndicator accessibilityLabel="Checking reset link" color="#2457E6" /> : complete ? <Text accessibilityRole="alert" style={s.success}>Password updated. You can now log in.</Text> : ready ? <><LoginInput testID="reset-password" icon="lock-closed-outline" label="New password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" editable={!saving} /><LoginInput testID="reset-confirm" icon="lock-closed-outline" label="Confirm password" value={confirm} onChangeText={setConfirm} secureTextEntry autoComplete="new-password" editable={!saving} />{error && <Text accessibilityRole="alert" style={s.error}>{error}</Text>}<Pressable accessibilityRole="button" disabled={saving} onPress={submit} style={s.submit}><Text style={s.button}>{saving ? 'Updating password…' : 'Update password'}</Text></Pressable></> : <Text accessibilityRole="alert" style={s.error}>{error}</Text>}
      <Pressable accessibilityRole="button" onPress={() => router.replace('/(auth)/login')} style={s.back}><Text style={s.button}>Back to login</Text></Pressable>
    </View>
  </ScrollView>;
}
const s = StyleSheet.create({ page: { flexGrow: 1, paddingHorizontal: 24, justifyContent: 'center' }, content: { width: '100%', maxWidth: 400, alignSelf: 'center' }, brand: { color: '#2457E6', fontSize: 22, marginBottom: 32 }, heading: { fontSize: 27, marginBottom: 28 }, error: { color: '#B63D60', lineHeight: 21, marginBottom: 16 }, success: { color: '#267552', lineHeight: 22 }, submit: { minHeight: 48, borderWidth: 1, borderColor: '#2457E6', borderRadius: 8, alignItems: 'center', justifyContent: 'center' }, button: { color: '#2457E6', fontSize: 13 }, back: { minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 16 } });
