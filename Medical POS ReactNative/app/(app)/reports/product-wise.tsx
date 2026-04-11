import { View, Text, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { theme } from '../../../constants/theme';
import { reportsApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';

export default function ProductWiseScreen() {
  const { user } = useSessionStore();
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['product_wise', user?.clinic_id, dateRange],
    queryFn: () => reportsApi.getProductWise(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd')).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.length) return <EmptyState message="No product data for this period" icon="cube-outline" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
      <FlatList data={data} keyExtractor={(_: any, idx: number) => String(idx)} renderItem={({ item }: { item: any }) => (
        <Card style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{item.medicine_name}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>Qty Sold: {item.total_qty_sold}</Text>
            </View>
            <Text style={{ color: theme.accent.primary, fontWeight: '700' }}>₹{Number(item.total_revenue).toLocaleString('en-IN')}</Text>
          </View>
        </Card>
      )} />
    </View>
  );
}
