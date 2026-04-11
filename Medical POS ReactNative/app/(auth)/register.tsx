import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../constants/theme';

export default function Register() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Register Tenant Clinic</Text>
      <Text style={styles.text}>(Sign up form placeholder. Use Supabase signup + backend trigger or custom route to scaffold clinic + user)</Text>
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
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.text.primary,
    marginBottom: 16,
  },
  text: {
    color: theme.text.muted
  }
});
