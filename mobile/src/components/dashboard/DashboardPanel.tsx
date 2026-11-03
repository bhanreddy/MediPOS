import React from 'react';
import { View, type ViewProps } from 'react-native';
import { brandBlue, nexsyPaletteFor } from '@/theme/nexsyrus';
import { useTheme } from '@/hooks/useTheme';

/** Dashboard cards follow the same appearance as every other workspace. */
export function DashboardPanel({ children, style, material, ...props }: ViewProps & { material?: 'hero' }) {
  const hero = material === 'hero';
  const { isDark } = useTheme();
  const p = nexsyPaletteFor(isDark);
  return <View {...props} style={[{ borderWidth: 1, borderRadius: 14, overflow: 'hidden' }, style, {
    backgroundColor: hero ? brandBlue : p.solid,
    borderColor: hero ? brandBlue : p.edge,
  }]}>{children}</View>;
}
