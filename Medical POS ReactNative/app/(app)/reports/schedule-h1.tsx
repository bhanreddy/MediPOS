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

export default function ScheduleH1Screen() {
  const { user } = useSessionStore();
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['schedule_h1', user?.clinic_id, dateRange],
    queryFn: () => reportsApi.getScheduleH1(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd')).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
      {!data?.length ? (
        <EmptyState message="No Schedule H1 sales in this period" icon="medkit-outline" />
      ) : (
        <FlatList data={data} keyExtractor={(_: any, idx: number) => String(idx)} renderItem={({ item }: { item: any }) => (
          <Card style={{ marginBottom: 8 }}>
            <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{item.medicine_name}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>INV: #{item.invoice_number} | {format(new Date(item.date), 'dd MMM yyyy')}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>Customer: {item.customer_name} | Batch: {item.batch}</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>Qty: {item.qty}</Text>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>₹{Number(item.amount).toLocaleString('en-IN')}</Text>
            </View>
          </Card>
        )} />
      )}
    </View>
  );
}
