import React, { createContext, forwardRef, useContext } from 'react';
import { Text as NativeText, StyleSheet, type TextProps } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

const TextNesting = createContext(false);

/** One font family across native screens, with normal nested-text inheritance. */
export const AppText = forwardRef<React.ComponentRef<typeof NativeText>, TextProps>(function AppText({ style, ...props }, ref) {
  const { theme } = useTheme();
  const nested = useContext(TextNesting);
  const flattened = StyleSheet.flatten(style);
  const weight = flattened?.fontWeight;
  const numericWeight = weight === 'bold' ? 700 : Number(weight) || 400;
  const family = theme.typography.family;
  const fontFamily = flattened?.fontFamily ?? (nested && weight === undefined ? undefined
    : numericWeight >= 700 ? family.bold : numericWeight >= 600 ? family.semiBold : numericWeight >= 500 ? family.medium : family.regular);
  return (
    <TextNesting.Provider value>
      <NativeText ref={ref} {...props} style={[{ color: nested ? undefined : theme.colors.text.primary, fontFamily }, style]} />
    </TextNesting.Provider>
  );
});
