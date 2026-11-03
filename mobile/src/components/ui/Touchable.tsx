import React from 'react';
import { Pressable, PressableProps, StyleProp, ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { useGlassPreferences } from '@/components/glass/LiquidGlass';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface TouchableProps extends PressableProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  scaleValue?: number;
}

export const Touchable: React.FC<TouchableProps> = ({
  children,
  style,
  scaleValue = 0.985,
  onPressIn,
  onPressOut,
  ...props
}) => {
  const { reduceMotion } = useGlassPreferences();
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePressIn = (e: any) => {
    scale.value = reduceMotion || props.disabled ? 1 : withTiming(scaleValue, { duration: 100 });
    onPressIn?.(e);
  };

  const handlePressOut = (e: any) => {
    scale.value = reduceMotion ? 1 : withTiming(1, { duration: 130 });
    onPressOut?.(e);
  };

  return (
    <AnimatedPressable
      style={[animatedStyle, style]}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      {...props}
    >
      {children}
    </AnimatedPressable>
  );
};
