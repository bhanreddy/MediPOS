import { View, TouchableOpacity, ViewStyle } from 'react-native';
import { theme } from '../../constants/theme';

interface CardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export function Card({ children, onPress, style }: CardProps) {
  const inner = (
    <View style={[{
      backgroundColor: theme.bg.card,
      borderRadius: theme.radius.md,
      padding: 16,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.05)',
    }, style]}>
      {children}
    </View>
  );

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.7} onPress={onPress}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}
