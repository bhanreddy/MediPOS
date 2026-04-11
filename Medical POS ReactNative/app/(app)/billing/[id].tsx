import { View, Text, ScrollView, TouchableOpacity, Alert, Linking } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { theme } from '../../../constants/theme';
import { salesApi, api } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { StatRow } from '../../../components/ui/StatRow';
import { Button } from '../../../components/ui/Button';

export default function SaleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { user } = useSessionStore();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['sale_detail', id],
    queryFn: () => salesApi.getById(id!).then(r => r.data.data),
    enabled: !!id,
  });

  const { data: invoiceData } = useQuery({
    queryKey: ['sale_invoice', id],
    queryFn: () => salesApi.getInvoiceHtml(id!).then(r => r.data.data),
    enabled: !!id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const sale = data;

  const handlePrint = async () => {
    if (!invoiceData?.html) return;
    await Print.printAsync({ html: invoiceData.html });
  };

  const handleShare = async () => {
    try {
      if (!invoiceData?.html) return;
      const { uri } = await Print.printToFileAsync({ html: invoiceData.html });
      await Sharing.shareAsync(uri);
    } catch (err) {
      Alert.alert('Error', 'Could not share invoice');
    }
  };

  const handleWhatsApp = () => {
    const msg = `Your invoice #${sale.invoice_number} for ₹${Number(sale.net_amount).toLocaleString('en-IN')} is ready. Thank you!`;
    Linking.openURL(`whatsapp://send?text=${encodeURIComponent(msg)}`);
  };

  const statusBadgeVariant = (s: string) => {
    if (s === 'paid') return 'success' as const;
    if (s === 'credit') return 'danger' as const;
    return 'warning' as const;
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <View>
          <Text style={{ color: theme.text.primary, fontSize: 20, fontWeight: '800' }}>Invoice #{sale.invoice_number}</Text>
          <Text style={{ color: theme.text.muted, fontSize: 13, marginTop: 4 }}>{format(new Date(sale.sale_date), 'dd MMM yyyy, hh:mm a')}</Text>
        </View>
        <Badge label={sale.payment_status} variant={statusBadgeVariant(sale.payment_status)} />
      </View>

      {/* Share/Print buttons */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        <Button label="Print" icon="print-outline" variant="secondary" onPress={handlePrint} />
        <Button label="Share" icon="share-outline" variant="secondary" onPress={handleShare} />
        <Button label="WhatsApp" icon="logo-whatsapp" variant="ghost" onPress={handleWhatsApp} />
      </View>

      {/* Clinic Details */}
      {invoiceData?.clinic && (
        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 16 }}>{invoiceData.clinic.name}</Text>
          {invoiceData.clinic.address && <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 2 }}>{invoiceData.clinic.address}</Text>}
          {invoiceData.clinic.gstin && <Text style={{ color: theme.text.muted, fontSize: 12 }}>GSTIN: {invoiceData.clinic.gstin}</Text>}
          {invoiceData.clinic.drug_licence_number && <Text style={{ color: theme.text.muted, fontSize: 12 }}>DL No: {invoiceData.clinic.drug_licence_number}</Text>}
        </Card>
      )}

      {/* Customer */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: theme.text.muted, fontSize: 11 }}>CUSTOMER</Text>
        <Text style={{ color: theme.text.primary, fontWeight: '600', marginTop: 2 }}>{sale.customers?.name || 'Walk-in Customer'}</Text>
        {sale.customers?.phone && <Text style={{ color: theme.text.muted, fontSize: 12 }}>{sale.customers.phone}</Text>}
      </Card>

      {/* Line Items */}
      <Card style={{ marginBottom: 12 }}>
        <Text style={{ color: theme.text.muted, fontSize: 11, marginBottom: 8 }}>ITEMS</Text>
        {sale.sale_items?.map((item: any, idx: number) => (
          <View key={item.id || idx} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.text.primary, fontSize: 13, fontWeight: '600' }}>{item.medicines?.name || 'Medicine'}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 11 }}>
                Batch: {item.medicine_batches?.batch_number || '-'} | Exp: {item.medicine_batches?.expiry_date?.slice(0, 7) || '-'}
              </Text>
              <Text style={{ color: theme.text.muted, fontSize: 11 }}>
                Qty: {item.quantity} × ₹{item.mrp} | Disc: {item.discount_pct}% | GST: {item.gst_rate}%
              </Text>
            </View>
            <Text style={{ color: theme.text.primary, fontWeight: '600' }}>₹{Number(item.total).toFixed(2)}</Text>
          </View>
        ))}
      </Card>

      {/* Totals */}
      <Card style={{ marginBottom: 12 }}>
        <StatRow label="Subtotal" value={`₹${Number(sale.subtotal).toFixed(2)}`} />
        <StatRow label="Discount" value={`-₹${Number(sale.discount || 0).toFixed(2)}`} valueColor={theme.status.success} />
        <StatRow label="CGST" value={`₹${(Number(sale.gst_amount) / 2).toFixed(2)}`} />
        <StatRow label="SGST" value={`₹${(Number(sale.gst_amount) / 2).toFixed(2)}`} />
        <StatRow label="Net Amount" value={`₹${Number(sale.net_amount).toFixed(2)}`} valueColor={theme.accent.primary} />
        <StatRow label="Payment Mode" value={(sale.payment_mode || '-').toUpperCase()} />
        <StatRow label="Paid" value={`₹${Number(sale.paid_amount || 0).toFixed(2)}`} />
        {Number(sale.balance_due) > 0 && <StatRow label="Balance Due" value={`₹${Number(sale.balance_due).toFixed(2)}`} valueColor={theme.status.error} />}
      </Card>

      {/* Footer disclaimer */}
      <Text style={{ color: theme.text.muted, fontSize: 10, textAlign: 'center', marginTop: 8, marginBottom: 24 }}>
        {invoiceData?.clinic?.invoice_footer || 'Not for returns after 7 days. Schedule H drugs sold on prescription only.'}
      </Text>
    </ScrollView>
  );
}
