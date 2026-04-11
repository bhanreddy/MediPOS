import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { format } from 'date-fns';
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

export default function ExpiryAlertsScreen() {
  const { user } = useSessionStore();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'critical' | 'warning' | 'watch'>('critical');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['expiry_alerts', user?.clinic_id],
    queryFn: () => api.get('/reports/expiry-report', { params: { days: 90 } }).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  const shortbookMutation = useMutation({
    mutationFn: (payload: any) => api.post('/shortbook', payload).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shortbook'] }); toast.success('Added to shortbook'); },
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const items = data?.[activeTab] || [];

  const severityVariant = (s: string) => {
    if (s === 'critical') return 'danger' as const;
    if (s === 'warning') return 'warning' as const;
    return 'info' as const;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {(['critical', 'warning', 'watch'] as const).map(tab => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: activeTab === tab ? theme.accent.primary : theme.bg.card, alignItems: 'center' }}>
            <Text style={{ color: activeTab === tab ? '#fff' : theme.text.primary, fontWeight: '600', textTransform: 'uppercase', fontSize: 12 }}>{tab}</Text>
            <Text style={{ color: activeTab === tab ? 'rgba(255,255,255,0.7)' : theme.text.muted, fontSize: 10, marginTop: 2 }}>
              {tab === 'critical' ? '≤30d' : tab === 'warning' ? '31-60d' : '61-90d'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {items.length === 0 ? (
        <EmptyState message="No medicines expiring in this period 🎉" icon="checkmark-circle-outline" />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item: any, idx: number) => `${item.medicine_id}-${idx}`}
          renderItem={({ item }: { item: any }) => (
            <Card style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: activeTab === 'critical' ? theme.status.error : activeTab === 'warning' ? theme.status.warning : theme.accent.secondary }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{item.medicine_name || item.name}</Text>
                  <Badge label={item.severity?.toUpperCase() || activeTab.toUpperCase()} variant={severityVariant(activeTab)} style={{ marginTop: 4 }} />
                  <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 4 }}>Batch: {item.batch_number}</Text>
                  <Text style={{ color: theme.text.muted, fontSize: 12 }}>Expiry: {format(new Date(item.expiry_date), 'dd MMM yyyy')}</Text>
                  <Text style={{ color: theme.text.muted, fontSize: 12 }}>Qty: {item.quantity_remaining} | MRP: ₹{item.mrp}</Text>
                </View>
                <Button label="Shortbook" variant="ghost" onPress={() => shortbookMutation.mutate({ medicine_id: item.medicine_id, reason: 'expired', qty_needed: item.quantity_remaining })} />
              </View>
            </Card>
          )}
        />
      )}
    </View>
  );
}
