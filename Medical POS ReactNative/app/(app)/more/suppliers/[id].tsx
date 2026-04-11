import { View, Text, ScrollView, TextInput, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { format } from 'date-fns';
import { theme } from '../../../../constants/theme';
import { api } from '../../../../lib/api';
import { LoadingScreen } from '../../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../../components/ui/ErrorScreen';
import { Card } from '../../../../components/ui/Card';
import { Badge } from '../../../../components/ui/Badge';
import { StatRow } from '../../../../components/ui/StatRow';
import { Button } from '../../../../components/ui/Button';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { toast } from '../../../../lib/toast';

export default function SupplierDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showPaySheet, setShowPaySheet] = useState(false);
  const [payAmount, setPayAmount] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['supplier_detail', id],
    queryFn: async () => {
      const [suppRes, outRes] = await Promise.all([
        api.get(`/suppliers/${id}`),
        api.get(`/suppliers/${id}/outstanding`),
      ]);
      return { ...suppRes.data.data, ...outRes.data.data };
    },
    enabled: !!id,
  });

  const payMutation = useMutation({
    mutationFn: (payload: any) => api.post(`/suppliers/${id}/payment`, payload).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['supplier_detail', id] }); setShowPaySheet(false); toast.success('Payment recorded'); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Failed'),
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const outstanding = Number(data.outstanding_balance) || 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.primary, fontSize: 20, fontWeight: '800' }}>{data.name}</Text>
        {data.phone && <Text style={{ color: theme.text.muted }}>{data.phone}</Text>}
        <StatRow label="GSTIN" value={data.gstin || '-'} />
        <StatRow label="Drug Licence" value={data.drug_licence_number || '-'} />
        <StatRow label="Outstanding" value={`₹${outstanding.toLocaleString('en-IN')}`} valueColor={outstanding > 0 ? theme.status.error : theme.status.success} />
      </Card>

      {outstanding > 0 && <Button label="Record Payment" icon="cash-outline" onPress={() => setShowPaySheet(true)} fullWidth style={{ marginBottom: 16 }} />}

      <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Recent Purchases</Text>
      {data.purchases?.map((p: any) => (
        <Card key={p.id} style={{ marginBottom: 6 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>#{p.invoice_number}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>{format(new Date(p.invoice_date), 'dd MMM yyyy')}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Badge label={p.payment_status} variant={p.payment_status === 'paid' ? 'success' : 'danger'} />
              <Text style={{ color: theme.text.primary, fontWeight: '600', marginTop: 4 }}>₹{Number(p.net_amount).toLocaleString('en-IN')}</Text>
            </View>
          </View>
        </Card>
      ))}

      <BottomSheet visible={showPaySheet} onClose={() => setShowPaySheet(false)} title="Record Payment">
        <Text style={{ color: theme.text.muted, marginBottom: 4 }}>Amount (₹)</Text>
        <View style={{ backgroundColor: theme.bg.card, borderRadius: 8, paddingHorizontal: 12, height: 46, justifyContent: 'center', marginBottom: 16 }}>
          <TextInput value={payAmount} onChangeText={setPayAmount} keyboardType="numeric" style={{ color: theme.text.primary, fontSize: 18 }} placeholderTextColor={theme.text.muted} placeholder="0" />
        </View>
        <Button label="Submit" onPress={() => payMutation.mutate({ amount: Number(payAmount) })} loading={payMutation.isPending} fullWidth />
      </BottomSheet>
    </ScrollView>
  );
}
