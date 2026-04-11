import { View, Text, TextInput, TextInputProps, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: keyof typeof Ionicons.glyphMap;
  rightIcon?: keyof typeof Ionicons.glyphMap;
  onRightIconPress?: () => void;
}

export function Input({ label, error, leftIcon, rightIcon, onRightIconPress, style, ...props }: InputProps) {
  const isError = !!error;

  return (
    <View style={[{ marginBottom: 16 }, style as any]}>
      {label && <Text style={{ color: theme.text.primary, marginBottom: 6, fontWeight: '500' }}>{label}</Text>}
      
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: theme.bg.surface,
        borderWidth: 1,
        borderColor: isError ? theme.status.error : 'rgba(255,255,255,0.1)',
        borderRadius: theme.radius.sm,
        paddingHorizontal: 12,
        height: 50,
      }}>
        {leftIcon && <Ionicons name={leftIcon} size={20} color={theme.text.muted} style={{ marginRight: 8 }} />}
        
        <TextInput
          placeholderTextColor={theme.text.muted}
          style={{ flex: 1, color: theme.text.primary, fontSize: 16 }}
          {...props}
        />

        {rightIcon && (
          <TouchableOpacity onPress={onRightIconPress} disabled={!onRightIconPress}>
            <Ionicons name={rightIcon} size={20} color={theme.text.muted} style={{ marginLeft: 8 }} />
          </TouchableOpacity>
        )}
      </View>

      {error && <Text style={{ color: theme.status.error, fontSize: 12, marginTop: 4 }}>{error}</Text>}
    </View>
  );
}
