import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { purchasesApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { usePagination } from '../../../hooks/usePagination';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { Button } from '../../../components/ui/Button';

export default function PurchasesListScreen() {
  const { user } = useSessionStore();
  const { page, limit, setPage } = usePagination();
  const [showFab, setShowFab] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['purchases', user?.clinic_id, page, limit],
    queryFn: () => purchasesApi.list({ page, limit }).then(r => r.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.data?.length) return (
    <EmptyState message="No purchases yet" subMessage="Record your first purchase" actionLabel="+ New Purchase" onAction={() => router.push('/(app)/purchases/new')} icon="cart-outline" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <FlatList
        data={data.data}
        keyExtractor={(item: any) => item.id}
        showsVerticalScrollIndicator={false}
        onEndReached={() => {
          if (data.pagination && page < data.pagination.totalPages) setPage(page + 1);
        }}
        renderItem={({ item }: { item: any }) => (
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text.primary, fontWeight: '700' }}>{item.suppliers?.name || 'Unknown Supplier'}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 2 }}>Inv: {item.invoice_number}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 12 }}>{format(new Date(item.invoice_date), 'dd MMM yyyy')}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Badge label={item.payment_status} variant={item.payment_status === 'paid' ? 'success' : item.payment_status === 'unpaid' ? 'danger' : 'warning'} />
                <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginTop: 4 }}>₹{Number(item.net_amount).toLocaleString('en-IN')}</Text>
              </View>
            </View>
          </Card>
        )}
      />

      {/* FAB with expand */}
      <View style={{ position: 'absolute', bottom: 20, right: 20 }}>
        {showFab && (
          <View style={{ marginBottom: 12, gap: 8, alignItems: 'flex-end' }}>
            <TouchableOpacity onPress={() => { setShowFab(false); router.push('/(app)/purchases/new'); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: theme.text.primary, marginRight: 8 }}>Manual Entry</Text>
              <Ionicons name="create-outline" size={18} color={theme.accent.primary} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowFab(false); router.push('/(app)/purchases/scan-bill'); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: theme.text.primary, marginRight: 8 }}>Scan Bill</Text>
              <Ionicons name="scan-outline" size={18} color={theme.status.warning} />
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setShowFab(false); router.push('/(app)/purchases/import-csv'); }} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.bg.surface, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10 }}>
              <Text style={{ color: theme.text.primary, marginRight: 8 }}>Import CSV</Text>
              <Ionicons name="document-outline" size={18} color={theme.accent.secondary} />
            </TouchableOpacity>
          </View>
        )}
        <TouchableOpacity
          onPress={() => setShowFab(!showFab)}
          style={{
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: theme.accent.primary,
            justifyContent: 'center', alignItems: 'center', elevation: 6, alignSelf: 'flex-end',
          }}
        >
          <Ionicons name={showFab ? 'close' : 'add'} size={28} color="#fff" />
        </TouchableOpacity>
      </View>
    </View>
  );
}
