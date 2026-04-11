import { View, Text, ScrollView, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { WebView } from 'react-native-webview';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { toast } from '../../../lib/toast';

export default function InvoiceSettingsScreen() {
  const { user } = useSessionStore();
  const queryClient = useQueryClient();
  const [footerText, setFooterText] = useState('');

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clinic_profile_invoice', user?.clinic_id],
    queryFn: () => api.get('/clinics/me').then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  useEffect(() => {
    if (data?.invoice_footer) setFooterText(data.invoice_footer);
  }, [data]);

  const mutation = useMutation({
    mutationFn: () => api.put('/clinics/me', { invoice_footer: footerText }).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic_profile_invoice'] });
      toast.success('Invoice settings saved');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Failed'),
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const sampleHtml = `
    <html><body style="font-family:sans-serif;padding:20px;background:#0A0A0F;color:#F0F4FF">
      <h2 style="margin:0">${data?.name || 'Clinic Name'}</h2>
      <p style="color:#6B7280;font-size:12px">${data?.address || 'Address'}<br/>GSTIN: ${data?.gstin || 'N/A'}</p>
      <hr/>
      <h3>Invoice #SAMPLE-001</h3>
      <table border="1" cellpadding="6" style="width:100%;border-collapse:collapse;color:#F0F4FF;border-color:#333">
        <tr><th>Item</th><th>Qty</th><th>MRP</th><th>Total</th></tr>
        <tr><td>Paracetamol 500mg</td><td>2</td><td>₹5.00</td><td>₹10.00</td></tr>
        <tr><td>Amoxicillin 250mg</td><td>1</td><td>₹15.00</td><td>₹15.00</td></tr>
      </table>
      <p style="font-size:14px;margin-top:8px"><strong>Total: ₹25.00</strong></p>
      <hr/>
      <p style="font-size:11px;color:#6B7280">${footerText || 'Your invoice footer text will appear here'}</p>
    </body></html>
  `;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '700', marginBottom: 16 }}>Invoice Footer Text</Text>

      <Input
        label="Footer Text"
        value={footerText}
        onChangeText={setFooterText}
        placeholder="E.g. Not for returns after 7 days."
        multiline
      />

      {/* Preview */}
      <Text style={{ color: theme.text.primary, fontWeight: '700', marginTop: 16, marginBottom: 8 }}>Preview</Text>
      <Card style={{ height: 340, padding: 0, overflow: 'hidden' }}>
        <WebView
          source={{ html: sampleHtml }}
          style={{ backgroundColor: theme.bg.primary }}
          scrollEnabled={true}
        />
      </Card>

      <Button label="Save" onPress={() => mutation.mutate()} fullWidth loading={mutation.isPending} style={{ marginTop: 16 }} icon="checkmark-circle-outline" />
    </ScrollView>
  );
}
