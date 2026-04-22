import React from 'react';
import { StyleSheet, ActivityIndicator, Text, ViewStyle, TextStyle } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Touchable } from './Touchable';
import { useTheme } from '@/hooks/useTheme';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export interface ButtonProps {
  title: string;
  variant?: ButtonVariant;
  isLoading?: boolean;
  disabled?: boolean;
  onPress: () => void;
  style?: ViewStyle;
  textStyle?: TextStyle;
}

export const Button: React.FC<ButtonProps> = ({
  title,
  variant = 'primary',
  isLoading = false,
  disabled = false,
  onPress,
  style,
  textStyle,
}) => {
  const { theme } = useTheme();

  const handlePress = () => {
    if (disabled || isLoading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const getBackgroundColor = () => {
    switch (variant) {
      case 'primary': return theme.colors.primary;
      case 'secondary': return theme.colors.surface;
      case 'danger': return theme.colors.danger;
      case 'ghost': return 'transparent';
    }
  };

  const getTextColor = () => {
    switch (variant) {
      case 'primary':
      case 'danger':
        return theme.colors.text.inverse;
      case 'secondary':
        return theme.colors.primary;
      case 'ghost':
        return theme.colors.text.primary;
    }
  };

  const getBorderColor = () => {
    if (variant === 'secondary') return theme.colors.primary;
    if (variant === 'ghost') return 'transparent';
    return getBackgroundColor();
  };

  return (
    <Touchable
      onPress={handlePress}
      disabled={disabled || isLoading}
      style={[
        styles.button,
        {
          backgroundColor: getBackgroundColor(),
          borderColor: getBorderColor(),
          borderWidth: variant === 'secondary' ? 1 : 0,
          borderRadius: theme.radius.pill,
          opacity: disabled ? 0.6 : 1,
        },
        style,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={getTextColor()} />
      ) : (
        <Text
          style={[
            styles.text,
            { color: getTextColor(), fontFamily: theme.typography.family.semiBold, fontSize: theme.typography.size.base },
            textStyle,
          ]}
        >
          {title}
        </Text>
      )}
    </Touchable>
  );
};

const styles = StyleSheet.create({
  button: {
    height: 48,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  text: {
    textAlign: 'center',
  },
});
