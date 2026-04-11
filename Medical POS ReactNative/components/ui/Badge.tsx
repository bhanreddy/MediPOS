import { View, Text, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';

interface BadgeProps {
  label: string;
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'muted';
  style?: ViewStyle;
}

export function Badge({ label, variant = 'info', style }: BadgeProps) {
  let bg = 'rgba(255,255,255,0.1)';
  let color = theme.text.primary;

  switch (variant) {
    case 'success':
      bg = 'rgba(34, 197, 94, 0.2)';
      color = theme.status.success;
      break;
    case 'warning':
      bg = 'rgba(245, 158, 11, 0.2)';
      color = theme.status.warning;
      break;
    case 'danger':
      bg = 'rgba(239, 68, 68, 0.2)';
      color = theme.status.error;
      break;
    case 'info':
      bg = 'rgba(0, 119, 182, 0.2)';
      color = theme.accent.secondary;
      break;
    case 'muted':
      bg = theme.bg.card;
      color = theme.text.muted;
      break;
  }

  return (
    <View style={[{
      backgroundColor: bg,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 999,
      alignSelf: 'flex-start',
    }, style]}>
      <Text style={{ color, fontSize: 12, fontWeight: '700', textTransform: 'uppercase' }}>
        {label}
      </Text>
    </View>
  );
}
