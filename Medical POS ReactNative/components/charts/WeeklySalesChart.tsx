import { View, Text } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { theme } from '../../constants/theme';
import { Card } from '../ui/Card';

type Props = {
  chartLabels: string[];
  chartValues: number[];
  chartWidth: number;
};

export function WeeklySalesChart({ chartLabels, chartValues, chartWidth }: Props) {
  if (chartLabels.length === 0 || !chartValues.some((v) => v > 0)) return null;

  return (
    <View style={{ marginBottom: 20 }}>
      <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Weekly Sales</Text>
      <Card>
        <LineChart
          data={{
            labels: chartLabels,
            datasets: [{ data: chartValues.length > 0 ? chartValues : [0] }],
          }}
          width={chartWidth}
          height={180}
          yAxisLabel="₹"
          yAxisSuffix=""
          chartConfig={{
            backgroundColor: 'transparent',
            backgroundGradientFrom: theme.bg.card,
            backgroundGradientTo: theme.bg.card,
            decimalPlaces: 0,
            color: (opacity = 1) => `rgba(0, 201, 167, ${opacity})`,
            labelColor: () => theme.text.muted,
            propsForDots: { r: '4', strokeWidth: '2', stroke: theme.accent.primary },
          }}
          bezier
          style={{ borderRadius: theme.radius.sm }}
        />
      </Card>
    </View>
  );
}
