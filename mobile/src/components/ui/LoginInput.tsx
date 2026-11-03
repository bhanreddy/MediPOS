import { forwardRef, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type TextInputProps,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useTheme } from "@/hooks/useTheme";

type LoginInputProps = TextInputProps & {
  label: string;
  error?: string;
  icon: "mail-outline" | "lock-closed-outline";
};

export const LoginInput = forwardRef<TextInput, LoginInputProps>(
  function LoginInput(
    { label, error, icon, secureTextEntry, onFocus, onBlur, ...props },
    ref,
  ) {
    const { theme, isDark } = useTheme();
    const { fontScale } = useWindowDimensions();
    const [focused, setFocused] = useState(false);
    const [visible, setVisible] = useState(false);
    const ink = isDark ? "#EEF2FB" : "#202D47";
    const muted = isDark ? "#A0ADC5" : "#64718A";
    const accent = isDark ? "#9DB7FF" : "#2457E6";
    const errorId = `${props.testID}-error`;

    return (
      <View style={styles.field}>
        <Text
          style={[
            styles.label,
            { color: ink, fontFamily: theme.typography.family.semiBold },
          ]}
        >
          {label}
        </Text>
        <View
          style={[
            styles.inputWrap,
            {
              minHeight: Math.max(48, 28 + 20 * fontScale),
              backgroundColor: isDark ? "#19243A" : "#FFFFFF",
              borderColor: error
                ? theme.colors.danger
                : focused
                  ? accent
                  : isDark
                    ? "#2D3A52"
                    : "#DDE2ED",
            },
          ]}
        >
          <Ionicons name={icon} size={18} color={muted} />
          <TextInput
            {...props}
            ref={ref}
            accessibilityLabel={label}
            accessibilityHint={error}
            style={[
              styles.input,
              { color: ink, fontFamily: theme.typography.family.regular },
            ]}
            secureTextEntry={secureTextEntry && !visible}
            autoCorrect={false}
            selectionColor={accent}
            placeholderTextColor={muted}
            onFocus={(event) => {
              setFocused(true);
              onFocus?.(event);
            }}
            onBlur={(event) => {
              setFocused(false);
              onBlur?.(event);
            }}
          />
          {secureTextEntry && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={visible ? "Hide password" : "Show password"}
              onPress={() => setVisible((value) => !value)}
              style={styles.eye}
              hitSlop={4}
            >
              <Ionicons
                name={visible ? "eye-off-outline" : "eye-outline"}
                size={20}
                color={muted}
              />
            </Pressable>
          )}
        </View>
        {error && (
          <Text
            nativeID={errorId}
            accessibilityLiveRegion="polite"
            style={[
              styles.error,
              {
                color: theme.colors.danger,
                fontFamily: theme.typography.family.medium,
              },
            ]}
          >
            {error}
          </Text>
        )}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  field: { marginBottom: 20 },
  label: { fontSize: 12, marginBottom: 9 },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    borderWidth: 1,
    borderRadius: 8,
    gap: 12,
  },
  input: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    paddingVertical: 12,
    paddingRight: 12,
  },
  eye: {
    width: 44,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 4,
  },
  error: { fontSize: 12, marginTop: 7, lineHeight: 18 },
});
