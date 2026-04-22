import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useTheme } from '@/hooks/useTheme';
import { useSale, useInvoice, useCreateReturn } from '@/hooks/useSales';
import { formatCurrency, formatDateTime } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useUIStore } from '@/stores/uiStore';
import type { SaleItem } from '@/api/sales';

export default function SaleDetailScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const addToast = useUIStore(s => s.addToast);

  const { data: sale, isLoading } = useSale(id as string);
  const { data: invoiceData, isLoading: isLoadingInvoice } = useInvoice(id as string);
  const createReturn = useCreateReturn();

  const [returnQtys, setReturnQtys] = useState<Record<string, number>>({});
  const returnSheetRef = useRef<GorhomBottomSheet>(null);

  const handlePrint = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!invoiceData?.html) {
      addToast('Invoice HTML not available yet', 'error');
      return;
    }
    try {
      await Print.printAsync({ html: invoiceData.html });
    } catch (err) {
      addToast('Failed to print invoice', 'error');
    }
  };

  const handleIncrementReturn = (itemId: string, maxQty: number) => {
    Haptics.selectionAsync();
    setReturnQtys(prev => ({
      ...prev,
      [itemId]: Math.min((prev[itemId] || 0) + 1, maxQty)
    }));
  };

  const handleDecrementReturn = (itemId: string) => {
    Haptics.selectionAsync();
    setReturnQtys(prev => ({
      ...prev,
      [itemId]: Math.max((prev[itemId] || 0) - 1, 0)
    }));
  };

  const processReturn = () => {
    const items = Object.entries(returnQtys)
      .filter(([_, qty]) => qty > 0)
      .map(([saleItemId, quantity]) => ({ saleItemId, quantity, reason: 'Customer returns' }));

    if (items.length === 0) {
      addToast('Select items to return', 'error');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createReturn.mutate({ saleId: id as string, items }, {
      onSuccess: () => {
        returnSheetRef.current?.collapse();
        router.back();
      }
    });
  };

  if (isLoading || !sale) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const isReturn = sale.paymentStatus?.toLowerCase() === 'returned';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
       <View style={[styles.headerLite, { paddingTop: insets.top + 8, backgroundColor: theme.colors.surface }]}>
         <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
           <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
         </TouchableOpacity>
         <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 18, color: theme.colors.text.primary }}>Sale Receipt</Text>
         <View style={{ width: 40 }} />
       </View>

       <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {/* Invoice Header */}
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
             <View style={styles.rowBetween}>
               <View>
                 <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 22, color: theme.colors.text.primary }}>
                   {sale.invoiceNumber}
                 </Text>
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 13, marginTop: 4 }}>
                   {formatDateTime(sale.createdAt)}
                 </Text>
               </View>
               <View style={[styles.strongBadge, { backgroundColor: isReturn ? theme.colors.dangerLight : theme.colors.successLight }]}>
                 <Text style={{ color: isReturn ? theme.colors.danger : theme.colors.success, fontFamily: theme.typography.family.bold }}>
                   {sale.paymentStatus || 'Paid'}
                 </Text>
               </View>
             </View>
             <View style={styles.divider} />
             <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>
               Billed to: <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{sale.customerName || 'Walk-in'}</Text>
             </Text>
          </View>

          {/* Items */}
          <Text style={styles.sectionTitle}>Itemized Details</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, paddingVertical: 8 }]}>
             {sale.items.map((item, idx) => (
                <View key={`${item.medicineId}-${idx}`} style={[styles.itemRow, idx !== sale.items.length - 1 && styles.borderBottom]}>
                   <View style={styles.rowBetween}>
                     <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 15, color: theme.colors.text.primary, flex: 1 }}>{item.medicineName}</Text>
                     <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 15, color: theme.colors.text.primary }}>{formatCurrency(item.total)}</Text>
                   </View>
                   <Text style={{ color: theme.colors.text.secondary, fontSize: 12, marginTop: 2 }}>
                     {item.quantity} × {formatCurrency(item.mrp)} {item.discount > 0 ? `(-${formatCurrency(item.discount)} disc)` : ''}
                   </Text>
                   {item.gstRate > 0 && (
                     <Text style={{ color: theme.colors.text.tertiary, fontSize: 11, marginTop: 2 }}>Inc. GST @ {item.gstRate}%</Text>
                   )}
                </View>
             ))}
          </View>

          {/* Totals */}
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
             <View style={styles.totalRow}>
                <Text style={{ color: theme.colors.text.secondary }}>Subtotal</Text>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{formatCurrency(sale.subtotal)}</Text>
             </View>
             <View style={styles.totalRow}>
                <Text style={{ color: theme.colors.text.secondary }}>Discount</Text>
                <Text style={{ color: theme.colors.success, fontFamily: theme.typography.family.medium }}>-{formatCurrency(sale.discount)}</Text>
             </View>
             <View style={styles.totalRow}>
                <Text style={{ color: theme.colors.text.secondary }}>GST Total</Text>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{formatCurrency(sale.gstTotal || 0)}</Text>
             </View>
             <View style={styles.divider} />
             <View style={styles.totalRow}>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold, fontSize: 16 }}>Net Total</Text>
                <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 22 }}>{formatCurrency(sale.grandTotal)}</Text>
             </View>
          </View>

          {/* Payment Info */}
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
             <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Ionicons name="wallet-outline" size={20} color={theme.colors.text.secondary} />
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium, marginLeft: 8 }}>Payment Info</Text>
             </View>
             <View style={styles.rowBetween}>
                <View style={[styles.modeBadge, { backgroundColor: theme.colors.background }]}>
                   <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{sale.paymentMode || 'Cash'}</Text>
                </View>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>
                  Paid: {formatCurrency(sale.grandTotal)}
                </Text>
             </View>
          </View>
       </ScrollView>

       {/* Sticky Actions */}
       <View style={[styles.actionsFooter, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: insets.bottom || 16 }]}>
          <TouchableOpacity style={[styles.actionBtnOutline, { borderColor: theme.colors.danger }]} onPress={() => returnSheetRef.current?.expand()}>
            <Ionicons name="return-down-back" size={18} color={theme.colors.danger} />
            <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.semiBold, marginLeft: 6 }}>Return Items</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.actionBtnSolid, { backgroundColor: theme.colors.primary, opacity: isLoadingInvoice ? 0.7 : 1 }]} 
            onPress={handlePrint}
            disabled={isLoadingInvoice}
          >
            {isLoadingInvoice ? <ActivityIndicator color="#FFF" /> : (
              <>
               <Ionicons name="print-outline" size={18} color="#FFF" />
               <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, marginLeft: 6 }}>Print Invoice</Text>
              </>
            )}
          </TouchableOpacity>
       </View>

       {/* Return Bottom Sheet */}
       <BottomSheet ref={returnSheetRef} snapPoints={['70%']} title="Process Return">
         <ScrollView style={{ padding: 16 }}>
            <Text style={{ color: theme.colors.text.secondary, marginBottom: 16 }}>Select the quantities of items the customer is returning.</Text>
            
            {sale.items.map((item, idx) => (
              <View key={`ret-${item.medicineId}-${idx}`} style={[styles.returnItemRow, { borderBottomColor: theme.colors.border }]}>
                 <View style={{ flex: 1 }}>
                   <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{item.medicineName}</Text>
                   <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>Max return: {item.quantity}</Text>
                 </View>
                 <View style={[styles.stepper, { borderColor: theme.colors.border }]}>
                   <TouchableOpacity style={styles.stepBtn} onPress={() => handleDecrementReturn(item.medicineId)}>
                     <Ionicons name="remove" size={18} color={theme.colors.text.primary} />
                   </TouchableOpacity>
                   <Text style={{ fontSize: 16, fontFamily: theme.typography.family.semiBold, marginHorizontal: 12 }}>
                     {returnQtys[item.medicineId] || 0}
                   </Text>
                   <TouchableOpacity style={styles.stepBtn} onPress={() => handleIncrementReturn(item.medicineId, item.quantity)}>
                     <Ionicons name="add" size={18} color={theme.colors.text.primary} />
                   </TouchableOpacity>
                 </View>
              </View>
            ))}

            <TouchableOpacity 
              style={[styles.processBtn, { backgroundColor: theme.colors.danger, marginTop: 24 }]}
              onPress={processReturn}
              disabled={createReturn.isPending}
            >
              {createReturn.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Confirm Return</Text>}
            </TouchableOpacity>
         </ScrollView>
       </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerLite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 12 },
  card: { borderRadius: 16, padding: 16, marginBottom: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  strongBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginLeft: 4, opacity: 0.8 },
  itemRow: { paddingVertical: 12, paddingHorizontal: 8 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  modeBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  actionsFooter: { flexDirection: 'row', padding: 16, borderTopWidth: 0.5, gap: 12 },
  actionBtnOutline: { flex: 1, flexDirection: 'row', height: 48, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  actionBtnSolid: { flex: 2, flexDirection: 'row', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  returnItemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, borderBottomWidth: 0.5 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 4 },
  stepBtn: { padding: 4 },
  processBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginBottom: 40 }
});
