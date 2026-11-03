import React, { createContext, useContext } from 'react';
import { type ViewProps } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useGlassPreferences } from '@/components/glass/LiquidGlass';

type RevealViewport = { top: SharedValue<number>; height: SharedValue<number>; inset: number };
export const RevealViewportContext = createContext<RevealViewport | null>(null);

/** Each direct section of the dashboard reveals once when it enters the scroll viewport. */
export function ScrollReveal({ style, onLayout, ...props }: ViewProps) {
  const viewport = useContext(RevealViewportContext);
  const { reduceMotion } = useGlassPreferences();
  const top = useSharedValue(Number.MAX_SAFE_INTEGER);
  const revealed = useSharedValue(false);
  useDerivedValue(() => {
    if (reduceMotion || !viewport || viewport.top.value + viewport.height.value > top.value + viewport.inset + 20) revealed.value = true;
  }, [reduceMotion, viewport]);
  const animated = useAnimatedStyle(() => ({
    opacity: reduceMotion ? 1 : withTiming(revealed.value ? 1 : 0, { duration: 360 }),
    transform: [{ translateY: reduceMotion ? 0 : withTiming(revealed.value ? 0 : 14, { duration: 360 }) }],
  }), [reduceMotion]);
  return <Animated.View {...props} onLayout={event => { top.value = event.nativeEvent.layout.y; onLayout?.(event); }} style={[style, animated]} />;
}
