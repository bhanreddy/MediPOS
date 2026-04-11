import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { theme } from '../../constants/theme';
import { useRouter } from 'expo-router';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async () => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setLoading(false);

    if (error) {
      alert(error.message);
    }
    // Success implies session changes -> useSession hook automatically refetches profile
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Medical POS</Text>
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Button label={loading ? 'Signing In...' : 'Sign In'} onPress={handleLogin} disabled={loading} />
      
      <Button 
        label="Register Clinic" 
        variant="secondary" 
        style={{ marginTop: 16 }} 
        onPress={() => router.push('/(auth)/register')} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
    backgroundColor: theme.bg.primary,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.accent.primary,
    marginBottom: 32,
    textAlign: 'center',
  }
});
