import { TouchableOpacity, Text, ActivityIndicator, ViewStyle, TextStyle } from 'react-native';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  icon?: keyof typeof Ionicons.glyphMap;
  fullWidth?: boolean;
  style?: ViewStyle;
}

export function Button({ 
  label, onPress, variant = 'primary', loading, disabled, icon, fullWidth, style 
}: ButtonProps) {
  let bg = theme.accent.primary;
  let textCol = '#FFF';

  if (variant === 'secondary') {
    bg = theme.bg.card;
    textCol = theme.text.primary;
  } else if (variant === 'danger') {
    bg = theme.status.error;
  } else if (variant === 'ghost') {
    bg = 'transparent';
    textCol = theme.accent.primary;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      disabled={disabled || loading}
      onPress={onPress}
      style={[
        {
          backgroundColor: bg,
          paddingVertical: 14,
          paddingHorizontal: 20,
          borderRadius: theme.radius.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
        },
        style
      ]}
    >
      {loading ? (
        <ActivityIndicator color={textCol} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={20} color={textCol} style={{ marginRight: 8 }} />}
          <Text style={{ color: textCol, fontSize: 16, fontWeight: '600' }}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );
}
