import React, { useMemo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '@/hooks/useTheme';

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const h = hex.replace('#', '');
  if (h.length !== 6) return null;
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

function colAlpha(hex: string, a: number): string {
  const rgb = hexToRgb(hex);
  if (!rgb) return `rgba(59,130,246,${a})`;
  return `rgba(${rgb.r},${rgb.g},${rgb.b},${a})`;
}

interface GlassMeshBackgroundProps {
  /** When false, only subtle wash (e.g. behind flat lists). Default true. */
  orbs?: boolean;
}

/**
 * Shared frosted mesh behind tab screens — keeps POS / Patients / etc. visually
 * consistent with the dashboard + inventory glass language.
 */
export function GlassMeshBackground({ orbs = true }: GlassMeshBackgroundProps) {
  const { theme, isDark } = useTheme();
  const c = theme.colors;

  const mesh = useMemo(() => {
    const neutral = isDark ? 'rgba(148, 163, 184, 0.14)' : 'rgba(100, 116, 139, 0.10)';
    return {
      orb1: colAlpha(c.primary, isDark ? 0.38 : 0.22),
      orb2: colAlpha(c.accent, isDark ? 0.26 : 0.16),
      orb3: neutral,
      vignetteTop: isDark ? 'rgba(13, 27, 42, 0)' : 'rgba(247, 249, 252, 0)',
      vignetteMid: isDark ? 'rgba(13, 27, 42, 0.45)' : 'rgba(247, 249, 252, 0.55)',
      vignetteBottom: isDark ? 'rgba(13, 27, 42, 0.92)' : 'rgba(247, 249, 252, 0.98)',
    };
  }, [c.primary, c.accent, isDark]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={[styles.fill, { backgroundColor: c.background }]} />
      {orbs ? (
        <>
          <View style={[styles.orb, styles.orbTopRight, { backgroundColor: mesh.orb1 }]} />
          <View style={[styles.orb, styles.orbMidLeft, { backgroundColor: mesh.orb2 }]} />
          <View style={[styles.orb, styles.orbBottom, { backgroundColor: mesh.orb3 }]} />
        </>
      ) : null}
      <LinearGradient
        colors={[mesh.vignetteTop, mesh.vignetteMid, mesh.vignetteBottom]}
        locations={[0, 0.42, 1]}
        style={StyleSheet.absoluteFill}
      />
      <View
        style={[
          StyleSheet.absoluteFill,
          {
            backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.35)',
            opacity: Platform.OS === 'ios' ? 0.9 : 0.75,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject },
  orb: {
    position: 'absolute',
    borderRadius: 999,
    opacity: 0.55,
  },
  orbTopRight: { top: -70, right: -50, width: 220, height: 220 },
  orbMidLeft: { top: '36%', left: -90, width: 260, height: 260 },
  orbBottom: { bottom: -100, right: -30, width: 280, height: 280 },
});
