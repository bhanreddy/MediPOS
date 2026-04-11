import { View, Text, ScrollView, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { format, subDays } from 'date-fns';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { theme } from '../../../constants/theme';
import { reportsApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../lib/toast';

export default function GstReportScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const { user } = useSessionStore();
  const [activeTab, setActiveTab] = useState<'sales' | 'purchases'>(type === 'purchase' ? 'purchases' : 'sales');
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['gst_report', activeTab, dateRange, user?.clinic_id],
    queryFn: () => {
      const from = format(dateRange.from, 'yyyy-MM-dd');
      const to = format(dateRange.to, 'yyyy-MM-dd');
      return activeTab === 'sales'
        ? reportsApi.getGstSales(from, to).then(r => r.data.data)
        : reportsApi.getGstPurchases(from, to).then(r => r.data.data);
    },
    enabled: !!user?.clinic_id,
  });

  const exportPdf = async () => {
    if (!data?.length) return;
    const rows = data.map((r: any) => `<tr><td>${r.gst_rate}%</td><td>₹${r.taxable_amount.toFixed(2)}</td><td>₹${r.cgst.toFixed(2)}</td><td>₹${r.sgst.toFixed(2)}</td><td>₹${r.total_gst.toFixed(2)}</td><td>₹${r.gross_amount.toFixed(2)}</td></tr>`).join('');
    const html = `<html><body><h2>GST ${activeTab} Register</h2><table border="1" cellpadding="5"><tr><th>Rate</th><th>Taxable</th><th>CGST</th><th>SGST</th><th>Total GST</th><th>Gross</th></tr>${rows}</table></body></html>`;
    try {
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri);
    } catch { toast.error('Export failed'); }
  };

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      {/* Tabs */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {(['sales', 'purchases'] as const).map(tab => (
          <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: activeTab === tab ? theme.accent.primary : theme.bg.card, alignItems: 'center' }}>
            <Text style={{ color: activeTab === tab ? '#fff' : theme.text.primary, fontWeight: '600', textTransform: 'capitalize' }}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />

      {!data?.length ? (
        <EmptyState message="No GST data for this period" icon="document-text-outline" />
      ) : (
        <>
          {/* Table */}
          <ScrollView horizontal showsHorizontalScrollIndicator>
            <View>
              <View style={{ flexDirection: 'row', backgroundColor: theme.bg.surface, paddingVertical: 8 }}>
                {['GST Rate', 'Taxable', 'CGST', 'SGST', 'Total GST', 'Gross'].map((h) => (
                  <Text key={h} style={{ width: 90, color: theme.text.muted, fontWeight: '700', fontSize: 11, textAlign: 'center' }}>{h}</Text>
                ))}
              </View>
              {data.map((row: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                  <Text style={{ width: 90, color: theme.text.primary, textAlign: 'center' }}>{row.gst_rate}%</Text>
                  <Text style={{ width: 90, color: theme.text.primary, textAlign: 'center' }}>₹{row.taxable_amount.toFixed(0)}</Text>
                  <Text style={{ width: 90, color: theme.text.primary, textAlign: 'center' }}>₹{row.cgst.toFixed(0)}</Text>
                  <Text style={{ width: 90, color: theme.text.primary, textAlign: 'center' }}>₹{row.sgst.toFixed(0)}</Text>
                  <Text style={{ width: 90, color: theme.accent.primary, textAlign: 'center', fontWeight: '600' }}>₹{row.total_gst.toFixed(0)}</Text>
                  <Text style={{ width: 90, color: theme.text.primary, textAlign: 'center' }}>₹{row.gross_amount.toFixed(0)}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <Button label="Export PDF" icon="download-outline" variant="secondary" onPress={exportPdf} style={{ marginTop: 16 }} />
        </>
      )}
    </ScrollView>
  );
}
