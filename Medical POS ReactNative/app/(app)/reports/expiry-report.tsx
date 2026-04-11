import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { format } from 'date-fns';
import { theme } from '../../../constants/theme';
import { reportsApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';

export default function ExpiryReportScreen() {
  const { user } = useSessionStore();
  const [days, setDays] = useState(90);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['expiry_report_full', user?.clinic_id, days],
    queryFn: () => reportsApi.getExpiryReport(days).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const all = [...(data?.critical || []), ...(data?.warning || []), ...(data?.watch || [])];
  if (!all.length) return <EmptyState message="No expiring batches 🎉" icon="checkmark-circle-outline" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {[30, 60, 90].map(d => (
          <TouchableOpacity key={d} onPress={() => setDays(d)}
            style={{ flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: days === d ? theme.accent.primary : theme.bg.card, alignItems: 'center' }}>
            <Text style={{ color: days === d ? '#fff' : theme.text.primary, fontWeight: '600' }}>{d} days</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList data={all} keyExtractor={(_: any, idx: number) => String(idx)} renderItem={({ item }: { item: any }) => (
        <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: item.severity === 'critical' ? theme.status.error : item.severity === 'warning' ? theme.status.warning : theme.accent.secondary }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{item.medicine_name || item.name}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>Batch: {item.batch_number} | Qty: {item.quantity_remaining}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>Exp: {format(new Date(item.expiry_date), 'dd MMM yyyy')}</Text>
            </View>
            <Badge label={item.severity || 'info'} variant={item.severity === 'critical' ? 'danger' : item.severity === 'warning' ? 'warning' : 'info'} />
          </View>
        </Card>
      )} />
    </View>
  );
}
