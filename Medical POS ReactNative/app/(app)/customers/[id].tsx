import { View, Text, ScrollView, FlatList, TextInput, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { useState } from 'react';
import { format } from 'date-fns';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { StatRow } from '../../../components/ui/StatRow';
import { Button } from '../../../components/ui/Button';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { toast } from '../../../lib/toast';

export default function CustomerDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payMode, setPayMode] = useState<string>('cash');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customer_detail', id],
    queryFn: () => api.get(`/customers/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  const { data: reminders } = useQuery({
    queryKey: ['reminders', id],
    queryFn: () => api.get('/customers/reminders/due').then(r => r.data.data),
  });

  const paymentMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/customers/${id}/payment`, payload).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customer_detail', id] }); setShowPaySheet(false); toast.success('Payment recorded'); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Payment failed'),
  });

  const markSentMutation = useMutation({
    mutationFn: (remId: string) => api.patch(`/customers/reminders/${remId}/sent`).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['reminders'] }); toast.info('Marked as sent'); },
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const cust = data;
  const outstanding = Number(cust.outstanding_balance) || 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      {/* Profile Header */}
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.primary, fontSize: 22, fontWeight: '800' }}>{cust.name}</Text>
        {cust.phone && <Text style={{ color: theme.text.muted, marginTop: 4 }}>{cust.phone}</Text>}
        {cust.doctor_name && <Text style={{ color: theme.text.muted, fontSize: 12 }}>Dr. {cust.doctor_name}</Text>}
      </Card>

      {/* Stats */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <Card style={{ flex: 1, alignItems: 'center' as any }}>
          <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '800' }}>{cust.total_purchases || 0}</Text>
          <Text style={{ color: theme.text.muted, fontSize: 11 }}>Purchases</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' as any }}>
          <Text style={{ color: theme.accent.primary, fontSize: 18, fontWeight: '800' }}>{cust.importance_score || 0}</Text>
          <Text style={{ color: theme.text.muted, fontSize: 11 }}>Score</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' as any }}>
          <Text style={{ color: outstanding > 0 ? theme.status.error : theme.status.success, fontSize: 18, fontWeight: '800' }}>₹{outstanding.toLocaleString('en-IN')}</Text>
          <Text style={{ color: theme.text.muted, fontSize: 11 }}>Outstanding</Text>
        </Card>
      </View>

      {/* Payment button */}
      {outstanding > 0 && (
        <Button label="Record Payment" icon="cash-outline" onPress={() => setShowPaySheet(true)} fullWidth style={{ marginBottom: 16 }} />
      )}

      {/* Purchase History */}
      <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Recent Purchases</Text>
      {cust.recent_sales?.length > 0 ? cust.recent_sales.map((sale: any) => (
        <Card key={sale.id} onPress={() => router.push({ pathname: '/(app)/billing/[id]', params: { id: sale.id } })} style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>#{sale.invoice_number}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>{format(new Date(sale.sale_date), 'dd MMM yyyy')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Badge label={sale.payment_status} variant={sale.payment_status === 'paid' ? 'success' : 'danger'} />
              <Text style={{ color: theme.text.primary, fontWeight: '600', marginTop: 4 }}>₹{Number(sale.net_amount).toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </Card>
      )) : <Text style={{ color: theme.text.muted, padding: 16, textAlign: 'center' }}>No purchase history</Text>}

      {/* Refill Reminders */}
      {reminders?.length > 0 && (
        <View style={{ marginTop: 16 }}>
          <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Refill Reminders</Text>
          {reminders.filter((r: any) => r.customers?.name === cust.name).map((rem: any) => (
            <Card key={rem.id} style={{ marginBottom: 6 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: theme.text.primary, fontSize: 13 }}>{rem.medicines?.name}</Text>
                  <Text style={{ color: theme.text.muted, fontSize: 12 }}>Due: {format(new Date(rem.remind_on), 'dd MMM yyyy')}</Text>
                </View>
                <Button label="Mark Sent" variant="ghost" onPress={() => markSentMutation.mutate(rem.id)} />
              </View>
            </Card>
          ))}
        </View>
      )}

      {/* Payment BottomSheet */}
      <BottomSheet visible={showPaySheet} onClose={() => setShowPaySheet(false)} title="Record Payment">
        <Text style={{ color: theme.text.muted, marginBottom: 4 }}>Amount (₹)</Text>
        <View style={{ backgroundColor: theme.bg.card, borderRadius: 8, paddingHorizontal: 12, height: 46, justifyContent: 'center', marginBottom: 12 }}>
          <TextInput value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" style={{ color: theme.text.primary, fontSize: 18 }} placeholderTextColor={theme.text.muted} placeholder="0" />
        </View>
        <Text style={{ color: theme.text.muted, marginBottom: 8 }}>Mode</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {['cash', 'upi', 'card', 'bank_transfer'].map(m => (
            <Button key={m} label={m.toUpperCase()} variant={payMode === m ? 'primary' : 'secondary'} onPress={() => setPayMode(m)} />
          ))}
        </View>
        <Button label="Submit Payment" onPress={() => paymentMutation.mutate({ amount: Number(payAmount), payment_mode: payMode })} loading={paymentMutation.isPending} fullWidth />
      </BottomSheet>
    </ScrollView>
  );
}
