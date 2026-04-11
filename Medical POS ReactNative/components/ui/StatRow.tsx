import { View, Text } from 'react-native';
import { theme } from '../../constants/theme';

interface StatRowProps {
  label: string;
  value: string;
  valueColor?: string;
}

export function StatRow({ label, value, valueColor }: StatRowProps) {
  return (
    <View style={{
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: 'rgba(255,255,255,0.04)',
    }}>
      <Text style={{ color: theme.text.muted, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: valueColor || theme.text.primary, fontSize: 14, fontWeight: '600' }}>{value}</Text>
    </View>
  );
}
