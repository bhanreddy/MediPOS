import { View, Text, FlatList } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { inventoryApi, api } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../lib/toast';

export default function LowStockAlertsScreen() {
  const { user } = useSessionStore();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['low_stock', user?.clinic_id],
    queryFn: () => inventoryApi.getLowStock().then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  const shortbookMutation = useMutation({
    mutationFn: (payload: any) => api.post('/shortbook', payload).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shortbook'] }); toast.success('Added to shortbook'); },
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.length) return <EmptyState message="No low stock alerts 🎉" icon="checkmark-circle-outline" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <FlatList
        data={data}
        keyExtractor={(item: any) => item.medicine_id || item.id}
        renderItem={({ item }: { item: any }) => {
          const stock = item.total_stock ?? item.current_stock ?? 0;
          const threshold = item.low_stock_threshold ?? 10;
          const progress = Math.min(stock / threshold, 1);

          return (
            <Card style={{ marginBottom: 10 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text.primary, fontWeight: '700' }}>{item.medicine_name || item.name}</Text>
                  <Badge label={item.category || 'medicine'} variant="muted" style={{ marginTop: 4 }} />
                  <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 6 }}>
                    Current: <Text style={{ color: theme.status.error, fontWeight: '700' }}>{stock}</Text> (Min: {threshold})
                  </Text>

                  {/* Progress bar */}
                  <View style={{ height: 6, backgroundColor: theme.bg.surface, borderRadius: 3, marginTop: 8 }}>
                    <View style={{ height: 6, backgroundColor: theme.status.error, borderRadius: 3, width: `${progress * 100}%` }} />
                  </View>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
                <Button label="Add to Shortbook" variant="ghost" onPress={() => shortbookMutation.mutate({ medicine_id: item.medicine_id || item.id, reason: 'low_stock', qty_needed: threshold - stock })} />
                <Button label="Quick Purchase" variant="secondary" onPress={() => router.push('/(app)/purchases/new')} />
              </View>
            </Card>
          );
        }}
      />
    </View>
  );
}
