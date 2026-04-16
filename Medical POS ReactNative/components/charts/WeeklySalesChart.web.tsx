import { View, Text } from 'react-native';
import { theme } from '../../constants/theme';

type Props = {
  chartLabels: string[];
  chartValues: number[];
  chartWidth: number;
};

/** react-native-chart-kit is not reliable on web; show a simple summary instead. */
export function WeeklySalesChart({ chartLabels, chartValues }: Props) {
  if (chartLabels.length === 0) return null;
  const total = chartValues.reduce((a, b) => a + b, 0);
  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Weekly sales</Text>
      <Text style={{ color: theme.text.muted, fontSize: 13, textAlign: 'center', lineHeight: 20 }}>
        Chart view is optimized for mobile. Week total: ₹{total.toLocaleString('en-IN')}
      </Text>
    </View>
  );
}
