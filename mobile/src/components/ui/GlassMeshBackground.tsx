import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/** The same quiet workspace background used by the dashboard. */
export const GlassMeshBackground = memo(function GlassMeshBackground(_props: { orbs?: boolean }) {
  const { theme } = useTheme();
  return <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[StyleSheet.absoluteFill, { backgroundColor: theme.colors.background }]} />;
});
