import { AppText as Text } from '@/components/ui/AppText';
import React, { useState } from 'react';
import { View, TextInput, StyleSheet, TextInputProps } from 'react-native';
import { LiquidPanel } from '@/components/glass/LiquidGlass';
import { useTheme } from '@/hooks/useTheme';

export interface InputProps extends TextInputProps {
  label: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input: React.FC<InputProps> = ({ label, error, icon, style, ...props }) => {
  const { theme, isDark } = useTheme();
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={styles.container}>
      {/* Basic label instead of floating for MVP, can upgrade to floating via Reanimated later */}
      <Text style={[styles.label, { color: isFocused ? theme.colors.primary : theme.colors.text.secondary }]}>
        {label}
      </Text>
      <LiquidPanel
        dark={isDark}
        style={[
          styles.inputContainer,
          {
            borderColor: error ? theme.colors.danger : isFocused ? theme.colors.primary : theme.colors.border,
            borderRadius: theme.radius.input,
          },
          style,
        ]}
      >
        {icon && <View style={styles.iconContainer}>{icon}</View>}
        <TextInput
          {...props}
          accessibilityLabel={props.accessibilityLabel ?? label}
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
        />
      </LiquidPanel>
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
    minHeight: 48,
    paddingHorizontal: 12,
  },
  input: {
    flex: 1,
    minHeight: 48,
    paddingVertical: 12,
  },
  iconContainer: {
    marginRight: 8,
  },
  error: {
    marginTop: 4,
    fontSize: 11,
  },
});
