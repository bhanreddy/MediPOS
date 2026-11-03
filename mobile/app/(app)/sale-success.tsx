import { useState } from 'react';
import { View, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { useTheme } from '@/hooks/useTheme';
import { useSale, useInvoice } from '@/hooks/useSales';
import { formatCurrency } from '@/utils/format';
import { printReceiptHtml } from '@/utils/printReceipt';
import { useUIStore } from '@/stores/uiStore';
import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceCard, WorkspaceEmpty } from '@/components/ui/Workspace';
import { Button } from '@/components/ui/Button';

function goToNewSale() { router.replace('/(app)/(tabs)/pos'); }

export default function SaleSuccessScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const addToast = useUIStore(s => s.addToast);
  const { data: sale, isLoading, isError } = useSale(id as string);
  const { data: invoiceData, isLoading: isLoadingInvoice, refetch: refetchInvoice } = useInvoice(id as string);
  const [isPrinting, setIsPrinting] = useState(false);
  const handleNewSale = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    goToNewSale();
  };

  const handlePrint = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsPrinting(true);
    try {
      let html = invoiceData?.html;
      if (!html?.trim()) {
        const refreshed = await refetchInvoice();
        html = refreshed.data?.html;
      }
      await printReceiptHtml(html);
    } catch (err) {
      addToast(err instanceof Error ? err.message : 'Failed to print receipt', 'error');
    } finally {
      setIsPrinting(false);
    }
  };


  return <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
    <WorkspaceHeader title="Sale complete" subtitle="Invoice and receipt" safeArea onBack={goToNewSale} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
      <View style={[styles.successIcon, { backgroundColor: theme.colors.successLight }]}><Ionicons name="checkmark-circle-outline" size={48} color={theme.colors.success} /></View>
      <Text accessibilityRole="header" style={styles.heading}>Sale complete</Text>
      <Text style={[styles.description, { color: theme.colors.text.secondary }]}>Ready for your next customer.</Text>
      {isLoading ? <ActivityIndicator accessibilityLabel="Loading sale details" color={theme.colors.primary} style={{ padding: 28 }} /> : isError || !sale ?
        <WorkspaceEmpty title="Receipt details are unavailable" description="You can find this invoice in Sales history." icon="receipt-outline" /> :
        <WorkspaceCard style={{ width: '100%', gap: 16 }}>
          <View style={styles.row}><Text style={{ color: theme.colors.text.secondary }}>Invoice</Text><Text style={styles.value}>{sale.invoiceNumber || 'Invoice'}</Text></View>
          <View style={styles.row}><Text style={{ color: theme.colors.text.secondary }}>Total</Text><Text style={[styles.amount, { color: theme.colors.primary }]}>{formatCurrency(sale.grandTotal)}</Text></View>
          <View style={styles.row}><Text style={{ color: theme.colors.text.secondary }}>Payment</Text><Text style={[styles.value, { textTransform: 'capitalize' }]}>{sale.paymentMode || 'Cash'}</Text></View>
        </WorkspaceCard>}
      <View style={styles.buttons}>
        <Button title="Print receipt" variant="secondary" onPress={() => void handlePrint()} isLoading={isPrinting || isLoadingInvoice} disabled={!sale} style={{ flex: 1 }} />
        <Button title="New sale" onPress={handleNewSale} style={{ flex: 1 }} />
      </View>
    </ScrollView>
  </View>;
}
const styles = StyleSheet.create({
  content: { width: '100%', maxWidth: 600, alignSelf: 'center', padding: 20, alignItems: 'center', gap: 16 },
  successIcon: { width: 88, height: 88, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 16 },
  heading: { fontSize: 24, fontWeight: '700', letterSpacing: -.6 },
  description: { fontSize: 13, lineHeight: 20, textAlign: 'center', marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  value: { fontSize: 14, fontWeight: '600' },
  amount: { fontSize: 24, fontWeight: '700', letterSpacing: -.5 },
  buttons: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 4 },
});
