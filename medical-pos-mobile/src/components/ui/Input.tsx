import React, { useState } from 'react';
import { View, TextInput, Text, StyleSheet, TextInputProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, icon, style, ...props }) => {
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {/* Basic label instead of floating for MVP, can upgrade to floating via Reanimated later */}
      <Text style={[styles.label, { color: isFocused ? theme.colors.primary : theme.colors.text.secondary }]}>
        {label}
      </Text>
      <View
        style={[
          styles.inputContainer,
          {
            borderColor: error ? theme.colors.danger : isFocused ? theme.colors.primary : theme.colors.border,
            borderRadius: theme.radius.input,
            backgroundColor: theme.colors.surface,
          },
          style,
        ]}
      >
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <TextInput
          style={[
            styles.input,
            { color: theme.colors.text.primary, fontFamily: theme.typography.family.regular, fontSize: theme.typography.size.base },
          ]}
          placeholderTextColor={theme.colors.text.secondary}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          {...props}
        />
      </View>
      {error && <Text style={[styles.error, { color: theme.colors.danger }]}>{error}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    marginBottom: 6,
    fontSize: 13,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    height: 48,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    height: '100%',
  },
  iconContainer: {
    marginRight: 8,
  },
  error: {
    marginTop: 4,
    fontSize: 11,
  },
});
