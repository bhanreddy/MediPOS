import { AppText as Text } from '@/components/ui/AppText';
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Pressable,
  type TextInputProps,
  type KeyboardTypeOptions,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LiquidPanel, useGlassPreferences } from '@/components/glass/LiquidGlass';
import { useTheme } from '@/hooks/useTheme';

/* ─── Props ─────────────────────────────────────────── */

export interface FloatingInputProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  error?: string;
  secureTextEntry?: boolean;
  rightIcon?: React.ReactNode;
  keyboardType?: KeyboardTypeOptions;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  editable?: boolean;
  testID?: string;
}

/* ─── Component ─────────────────────────────────────── */

export const FloatingInput: React.FC<FloatingInputProps> = ({
  label,
  value,
  onChangeText,
  error,
  secureTextEntry = false,
  rightIcon,
  keyboardType,
  autoCapitalize,
  editable = true,
  testID,
}) => {
  const { theme, isDark } = useTheme();
  const { reduceMotion } = useGlassPreferences();
  const { fontScale } = useWindowDimensions();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureVisible, setIsSecureVisible] = useState(!secureTextEntry);

  // Animated value: 0 = label as placeholder, 1 = label floated
  const labelProgress = useSharedValue(value.length > 0 ? 1 : 0);

  const isActive = isFocused || value.length > 0;

  useEffect(() => {
    labelProgress.value = reduceMotion ? (isActive ? 1 : 0) : withTiming(isActive ? 1 : 0, { duration: 160 });
  }, [isActive, labelProgress, reduceMotion]);

  /* ─── Animated Styles ───────────────────────────────── */

  const animatedLabelStyle = useAnimatedStyle(() => {
    const top = interpolate(labelProgress.value, [0, 1], [18, 6]);
    const fontSize = interpolate(labelProgress.value, [0, 1], [14, 11]);

    return {
      top,
      fontSize,
    };
  });

  const borderColor = error
    ? theme.colors.danger
    : isFocused
      ? theme.colors.primary
      : theme.colors.border;

  const borderWidth = isFocused ? 2 : 1;

  /* ─── Handlers ──────────────────────────────────────── */

  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  const toggleSecure = useCallback(
    () => setIsSecureVisible((prev) => !prev),
    [],
  );

  /* ─── Label Color ───────────────────────────────────── */

  const labelColor = error
    ? theme.colors.danger
    : isFocused
      ? theme.colors.primary
      : theme.colors.text.secondary;

  return (
    <View style={styles.container}>
      <LiquidPanel dark={isDark}
        style={[
          styles.inputWrapper,
          { height: Math.max(56, 44 + 16 * fontScale) },
          {
            borderColor,
            borderWidth,
            borderRadius: theme.radius.input,
            backgroundColor: theme.colors.surface,
          },
        ]}
      >
        {/* Floating Label */}
        <Animated.Text
          style={[
            styles.label,
            animatedLabelStyle,
            {
              color: labelColor,
              fontFamily: isActive
                ? theme.typography.family.medium
                : theme.typography.family.regular,
            },
          ]}
          numberOfLines={1}
        >
          {label}
        </Animated.Text>

        {/* Text Input */}
        <TextInput
          testID={testID}
          style={[
            styles.input,
            {
              color: theme.colors.text.primary,
              fontFamily: theme.typography.family.regular,
              fontSize: theme.typography.size.base,
            },
          ]}
          accessibilityLabel={label}
          value={value}
          onChangeText={onChangeText}
          onFocus={handleFocus}
          onBlur={handleBlur}
          secureTextEntry={secureTextEntry && !isSecureVisible}
          keyboardType={keyboardType}
          autoCapitalize={autoCapitalize}
          editable={editable}
          placeholderTextColor="transparent"
          selectionColor={theme.colors.primary}
        />

        {/* Right Icon — eye toggle or custom */}
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSecureVisible ? 'Hide password' : 'Show password'}
            onPress={toggleSecure}
            style={styles.iconButton}
            hitSlop={8}
          >
            <Ionicons
              name={isSecureVisible ? 'eye-off-outline' : 'eye-outline'}
              size={20}
              color={theme.colors.text.tertiary}
            />
          </Pressable>
        ) : rightIcon ? (
          <View style={styles.iconButton}>{rightIcon}</View>
        ) : null}
      </LiquidPanel>

      {/* Error Text */}
      {error ? (
        <Text
          style={[
            styles.errorText,
            {
              color: theme.colors.danger,
              fontFamily: theme.typography.family.regular,
              fontSize: theme.typography.size.xs,
            },
          ]}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
};

/* ─── Styles ────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  inputWrapper: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    position: 'relative',
  },
  label: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingTop: 14,
  },
  iconButton: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  errorText: {
    marginTop: 4,
    marginLeft: 4,
  },
});
