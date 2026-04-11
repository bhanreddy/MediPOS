import { View, Text, ScrollView, FlatList } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, router } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { useRole } from '../../../hooks/useRole';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { StatRow } from '../../../components/ui/StatRow';
import { Button } from '../../../components/ui/Button';

export default function MedicineDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { isOwner } = useRole();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['medicine_detail', id],
    queryFn: () => api.get(`/inventory/medicines/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const medicine = data;

  const getBatchColor = (expiryDate: string) => {
    const exp = new Date(expiryDate);
    const now = new Date();
    const diff = (exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (diff < 0) return theme.status.error;
    if (diff < 30) return theme.status.warning;
    return theme.status.success;
  };

  const totalStock = medicine.batches?.reduce((s: number, b: any) => s + b.quantity_remaining, 0) || 0;
  const nearestExpiry = medicine.batches?.filter((b: any) => b.quantity_remaining > 0).sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())[0];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: theme.text.primary, fontSize: 22, fontWeight: '800' }}>{medicine.name}</Text>
          {medicine.generic_name && <Text style={{ color: theme.text.muted, marginTop: 2 }}>{medicine.generic_name}</Text>}
        </View>
        {isOwner && (
          <Button label="Edit" variant="secondary" onPress={() => {}} icon="create-outline" />
        )}
      </View>

      {/* Details Card */}
      <Card style={{ marginBottom: 16 }}>
        <StatRow label="Manufacturer" value={medicine.manufacturer || '-'} />
        <StatRow label="Category" value={medicine.category} />
        <StatRow label="HSN Code" value={medicine.hsn_code || '-'} />
        <StatRow label="GST Rate" value={`${medicine.gst_rate}%`} />
        <StatRow label="Unit" value={medicine.unit} />
        <StatRow label="Schedule H1" value={medicine.is_schedule_h1 ? 'Yes' : 'No'} valueColor={medicine.is_schedule_h1 ? theme.status.warning : theme.text.primary} />
        <StatRow label="Low Stock Threshold" value={String(medicine.low_stock_threshold)} />
      </Card>

      {/* Stock Summary */}
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 8 }}>Stock Summary</Text>
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: totalStock <= medicine.low_stock_threshold ? theme.status.error : theme.status.success, fontSize: 28, fontWeight: '800' }}>{totalStock}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>Total Stock</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: theme.text.primary, fontSize: 28, fontWeight: '800' }}>{medicine.batches?.length || 0}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>Batches</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ color: nearestExpiry ? getBatchColor(nearestExpiry.expiry_date) : theme.text.muted, fontSize: 14, fontWeight: '600' }}>
              {nearestExpiry ? format(new Date(nearestExpiry.expiry_date), 'MMM yyyy') : '-'}
            </Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>Nearest Exp</Text>
          </View>
        </View>
      </Card>

      {/* Batches */}
      <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 16, marginBottom: 8 }}>Batches</Text>
      {medicine.batches?.length > 0 ? (
        medicine.batches.map((batch: any) => (
          <Card key={batch.id} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: getBatchColor(batch.expiry_date) }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: theme.text.primary, fontWeight: '600' }}>Batch: {batch.batch_number}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 12 }}>Expiry: {format(new Date(batch.expiry_date), 'dd MMM yyyy')}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 12 }}>Purchase: ₹{batch.purchase_price} | MRP: ₹{batch.mrp}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 18 }}>{batch.quantity_remaining}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 11 }}>remaining</Text>
              </View>
            </View>
          </Card>
        ))
      ) : (
        <Text style={{ color: theme.text.muted, textAlign: 'center', padding: 16 }}>No batches available</Text>
      )}
    </ScrollView>
  );
}
