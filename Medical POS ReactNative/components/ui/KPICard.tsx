import { View, Text, TouchableOpacity } from 'react-native';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface KPICardProps {
  label: string;
  value: string;
  subValue?: string;
  trend?: 'up' | 'down' | 'neutral';
  icon?: keyof typeof Ionicons.glyphMap;
  onPress?: () => void;
  accentColor?: string;
}

export function KPICard({ label, value, subValue, trend, icon, onPress, accentColor }: KPICardProps) {
  const accent = accentColor || theme.accent.primary;
  const trendColor = trend === 'up' ? theme.status.success : trend === 'down' ? theme.status.error : theme.text.muted;
  const trendIcon = trend === 'up' ? 'trending-up' : trend === 'down' ? 'trending-down' : 'remove-outline';

  const content = (
    <View style={{
      backgroundColor: theme.bg.card,
      borderRadius: theme.radius.md,
      padding: 16,
      borderTopWidth: 3,
      borderTopColor: accent,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.05)',
      minWidth: 150,
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        {icon && <Ionicons name={icon} size={20} color={accent} />}
        {trend && <Ionicons name={trendIcon as any} size={16} color={trendColor} />}
      </View>
      <Text style={{ color: theme.text.primary, fontSize: 22, fontWeight: '800' }}>{value}</Text>
      <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 4 }}>{label}</Text>
      {subValue && (
        <Text style={{ color: trendColor, fontSize: 11, marginTop: 2 }}>{subValue}</Text>
      )}
    </View>
  );

  if (onPress) {
    return <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={{ flex: 1 }}>{content}</TouchableOpacity>;
  }
  return <View style={{ flex: 1 }}>{content}</View>;
}
