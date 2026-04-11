import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { salesApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { usePagination } from '../../../hooks/usePagination';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { Button } from '../../../components/ui/Button';

export default function SalesListScreen() {
  const { user } = useSessionStore();
  const { page, limit, setPage } = usePagination();
  const [showFilters, setShowFilters] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [dateRange, setDateRange] = useState({ from: new Date(Date.now() - 30 * 86400000), to: new Date() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sales', user?.clinic_id, page, limit, statusFilter, dateRange],
    queryFn: () => salesApi.list({
      page, limit,
      payment_status: statusFilter,
      from: format(dateRange.from, 'yyyy-MM-dd'),
      to: format(dateRange.to, 'yyyy-MM-dd'),
    }).then(r => r.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.data?.length) return (
    <EmptyState message="No sales yet" subMessage="Create your first sale to get started" actionLabel="+ New Sale" onAction={() => router.push('/(app)/billing/new')} icon="receipt-outline" />
  );

  const statusBadgeVariant = (s: string) => {
    if (s === 'paid') return 'success';
    if (s === 'credit') return 'danger';
    if (s === 'partial') return 'warning';
    return 'muted';
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '700' }}>Recent Sales</Text>
        <TouchableOpacity onPress={() => setShowFilters(true)}>
          <Ionicons name="filter-outline" size={22} color={theme.accent.primary} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={data.data}
        keyExtractor={(item: any) => item.id}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (data.pagination && page < data.pagination.totalPages) setPage(page + 1);
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }: { item: any }) => (
          <Card onPress={() => router.push({ pathname: '/(app)/billing/[id]', params: { id: item.id } })} style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 15 }}>#{item.invoice_number}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 2 }}>{format(new Date(item.sale_date), 'dd MMM yyyy, hh:mm a')}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 13, marginTop: 4 }}>{item.customers?.name || 'Walk-in'}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Badge label={item.payment_status} variant={statusBadgeVariant(item.payment_status)} />
                <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginTop: 6 }}>₹{Number(item.net_amount).toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </Card>
        )}
      />

      {/* FAB */}
      <TouchableOpacity
        testID="fab-new-sale"
        onPress={() => router.push('/(app)/billing/new')}
        style={{
          position: 'absolute', bottom: 20, right: 20,
          width: 56, height: 56, borderRadius: 28,
          backgroundColor: theme.accent.primary,
          justifyContent: 'center', alignItems: 'center',
          elevation: 6,
        }}
      >
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Filters BottomSheet */}
      <BottomSheet visible={showFilters} onClose={() => setShowFilters(false)} title="Filters">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
        <Text style={{ color: theme.text.primary, fontWeight: '600', marginBottom: 8 }}>Payment Status</Text>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          {['paid', 'partial', 'credit', undefined].map((s) => (
            <TouchableOpacity
              key={String(s)}
              onPress={() => setStatusFilter(s)}
              style={{
                paddingHorizontal: 16, paddingVertical: 8,
                borderRadius: 20,
                backgroundColor: statusFilter === s ? theme.accent.primary : theme.bg.card,
              }}
            >
              <Text style={{ color: statusFilter === s ? '#fff' : theme.text.primary, fontSize: 13 }}>
                {s || 'All'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Button label="Apply" onPress={() => { setShowFilters(false); refetch(); }} fullWidth />
      </BottomSheet>
    </View>
  );
}
