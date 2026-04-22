import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Pressable,
  type TextInputProps,
  type KeyboardTypeOptions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  interpolate,
  interpolateColor,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
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
  const { theme } = useTheme();
  const [isFocused, setIsFocused] = useState(false);
  const [isSecureVisible, setIsSecureVisible] = useState(!secureTextEntry);

  // Animated value: 0 = label as placeholder, 1 = label floated
  const labelProgress = useSharedValue(value.length > 0 ? 1 : 0);

  const isActive = isFocused || value.length > 0;

  useEffect(() => {
    labelProgress.value = withTiming(isActive ? 1 : 0, { duration: 180 });
  }, [isActive, labelProgress]);

  /* ─── Animated Styles ───────────────────────────────── */

  const animatedLabelStyle = useAnimatedStyle(() => {
    const top = interpolate(labelProgress.value, [0, 1], [18, 6]);
    const fontSize = interpolate(labelProgress.value, [0, 1], [15, 11]);

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
      <View
        style={[
          styles.inputWrapper,
          {
            borderColor,
            borderWidth,
            borderRadius: theme.radius.card,
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
      </View>

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
    zIndex: 1,
    backgroundColor: 'transparent',
  },
  input: {
    flex: 1,
    height: '100%',
    paddingTop: 14,
  },
  iconButton: {
    padding: 4,
    marginLeft: 8,
  },
  errorText: {
    marginTop: 4,
    marginLeft: 4,
  },
});
