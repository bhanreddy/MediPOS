import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useTheme } from '@/hooks/useTheme';
import { usePurchase, useUpdatePurchasePayment } from '@/hooks/usePurchases';
import type { PurchaseDetail, PurchaseItem, PurchaseLineItemRow } from '@/api/purchases';
import { formatCurrency, formatDate } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';

/** Ledger — GET returns snake_case `paid_amount` / `net_amount`; older mocks may expose camelCase. */
function getPurchaseLedger(p: PurchaseDetail) {
  const prevPaid = Number(p.paid_amount ?? p.amountPaid ?? 0);
  const netPayable = Number(p.net_amount ?? p.grandTotal ?? 0);
  return { prevPaid, netPayable };
}

/** Line items from `purchase_items` join or legacy `items` (camelCase). */
function normalizePurchaseLineItems(purchase: PurchaseDetail): PurchaseItem[] {
  const raw = purchase.purchase_items ?? purchase.items;
  if (!raw || !Array.isArray(raw)) return [];
  const first = raw[0];
  if (first && typeof first === 'object' && 'medicineName' in first) {
    return raw as PurchaseItem[];
  }
  return (raw as PurchaseLineItemRow[]).map((it) => {
    const meds = it.medicines;
    return {
      medicineId: String(it.medicine_id ?? ''),
      medicineName: String(meds?.name ?? ''),
      batchNumber: String(it.batch_number ?? ''),
      expiryDate: String(it.expiry_date ?? ''),
      quantity: Number(it.quantity ?? 0),
      purchasePrice: Number(it.purchase_price ?? 0),
      mrp: Number(it.mrp ?? 0),
      gstRate: Number(it.gst_rate ?? 0),
    };
  });
}

export default function PurchaseDetailScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data: purchase, isLoading } = usePurchase(id as string);
  const updatePayment = useUpdatePurchasePayment();

  const [paymentAmount, setPaymentAmount] = useState('');

  const paymentSheetRef = useRef<GorhomBottomSheet>(null);

  const submitPaymentUpdate = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!purchase) return;
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;

    const { prevPaid, netPayable } = getPurchaseLedger(purchase);
    const newPaidTotal = prevPaid + amt;

    let payment_status: 'unpaid' | 'partial' | 'paid';
    if (newPaidTotal >= netPayable) {
      payment_status = 'paid';
    } else if (newPaidTotal > 0) {
      payment_status = 'partial';
    } else {
      payment_status = 'unpaid';
    }

    updatePayment.mutate(
      { id: purchase.id, body: { paid_amount: newPaidTotal, payment_status } },
      {
        onSuccess: () => {
          paymentSheetRef.current?.collapse();
          setPaymentAmount('');
        },
      },
    );
  };

  if (isLoading || !purchase) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const { prevPaid, netPayable } = getPurchaseLedger(purchase);
  const outstanding = Math.max(0, netPayable - prevPaid);
  const payStatus =
    (typeof purchase.payment_status === 'string' && purchase.payment_status) ||
    (typeof purchase.paymentStatus === 'string' && purchase.paymentStatus) ||
    '';
  const isPaid = outstanding <= 0.01 || payStatus.toLowerCase() === 'paid';

  const lineItems = normalizePurchaseLineItems(purchase);
  const supplierLabel = purchase.suppliers?.name ?? purchase.supplierName ?? 'Direct Purchase';

  const billNo = purchase.invoice_number ?? purchase.billNumber ?? '';
  const created =
    (typeof purchase.created_at === 'string' && purchase.created_at) ||
    (typeof purchase.createdAt === 'string' && purchase.createdAt) ||
    '';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
       <View style={[styles.headerLite, { paddingTop: insets.top + 8, backgroundColor: theme.colors.surface }]}>
         <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
           <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
         </TouchableOpacity>
         <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 18, color: theme.colors.text.primary }}>Purchase Details</Text>
         <View style={{ width: 40 }} />
       </View>

       <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
          {/* Header Card */}
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
             <View style={styles.rowBetween}>
               <View>
                 <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 13, color: theme.colors.text.secondary }}>
                   Supplier
                 </Text>
                 <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 18, color: theme.colors.text.primary, marginTop: 4 }}>
                   {supplierLabel}
                 </Text>
               </View>
               <View style={[styles.statusBadge, { backgroundColor: isPaid ? theme.colors.successLight : theme.colors.dangerLight }]}>
                 <Text style={{ color: isPaid ? theme.colors.success : theme.colors.danger, fontFamily: theme.typography.family.bold }}>
                   {payStatus || 'Unpaid'}
                 </Text>
               </View>
             </View>
             <View style={styles.divider} />
             <View style={styles.rowBetween}>
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>Bill No: <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }}>{billNo}</Text></Text>
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>{created ? formatDate(created) : ''}</Text>
             </View>
          </View>

          {/* Line Items */}
          <Text style={styles.sectionTitle}>Line Items</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, paddingVertical: 8 }]}>
             {lineItems.map((item, idx) => (
                <View key={`item-${idx}`} style={[styles.itemRow, idx !== lineItems.length - 1 && styles.borderBottom]}>
                   <View style={styles.rowBetween}>
                     <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 15, color: theme.colors.text.primary, flex: 1 }}>{item.medicineName}</Text>
                     <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 15, color: theme.colors.text.primary }}>
                       {formatCurrency(item.quantity * item.purchasePrice)}
                     </Text>
                   </View>
                   <Text style={{ color: theme.colors.text.secondary, fontSize: 12, marginTop: 4 }}>
                     Batch: <Text style={{ fontFamily: theme.typography.family.medium }}>{item.batchNumber}</Text> • Exp: {formatDate(item.expiryDate)}
                   </Text>
                   <View style={[styles.rowBetween, { marginTop: 6 }]}>
                     <Text style={{ color: theme.colors.text.tertiary, fontSize: 12 }}>
                       {item.quantity} units @ {formatCurrency(item.purchasePrice)}
                     </Text>
                     <Text style={{ color: theme.colors.primary, fontSize: 11, fontFamily: theme.typography.family.medium }}>MRP: {formatCurrency(item.mrp || 0)}</Text>
                   </View>
                </View>
             ))}
          </View>

          {/* Totals */}
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
             <View style={styles.totalRow}>
                <Text style={{ color: theme.colors.text.secondary }}>Subtotal</Text>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{formatCurrency(Number(purchase.subtotal ?? 0))}</Text>
             </View>
             <View style={styles.totalRow}>
                <Text style={{ color: theme.colors.text.secondary }}>GST Total</Text>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{formatCurrency(Number(purchase.gst_amount ?? purchase.gstTotal ?? 0))}</Text>
             </View>
             <View style={styles.divider} />
             <View style={styles.totalRow}>
                <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold, fontSize: 16 }}>Net Payable</Text>
                <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 20 }}>{formatCurrency(netPayable)}</Text>
             </View>
          </View>

          {/* Payment Card */}
          <Text style={styles.sectionTitle}>Payment Ledger</Text>
          <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, borderColor: outstanding > 0 ? theme.colors.danger : theme.colors.border, borderWidth: outstanding > 0 ? 1 : 0 }]}>
             <View style={styles.rowBetween}>
                <Text style={{ color: theme.colors.text.secondary }}>Total Paid</Text>
                <Text style={{ color: theme.colors.success, fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>{formatCurrency(prevPaid)}</Text>
             </View>
             
             {outstanding > 0 && (
               <>
                 <View style={styles.divider} />
                 <View style={styles.rowBetween}>
                    <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.medium }}>Outstanding</Text>
                    <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.bold, fontSize: 16 }}>{formatCurrency(outstanding)}</Text>
                 </View>
                 
                 <TouchableOpacity 
                   style={[styles.payBtn, { backgroundColor: theme.colors.danger }]}
                   onPress={() => paymentSheetRef.current?.expand()}
                 >
                    <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold }}>Update Payment Tracker</Text>
                 </TouchableOpacity>
               </>
             )}
          </View>

       </ScrollView>

       {/* Update Payment Bottom Sheet */}
       <BottomSheet ref={paymentSheetRef} snapPoints={['55%']} title="Log Purchase Payment">
        <View style={{ padding: 24 }}>
           <Text style={{ color: theme.colors.text.secondary, marginBottom: 8 }}>Amount paying now (added to total paid)</Text>
           <View style={[styles.paymentInputRow, { borderColor: theme.colors.border }]}>
              <Text style={{ fontSize: 24, color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>₹</Text>
              <TextInput
                style={[styles.paymentInput, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder={outstanding.toString()}
                placeholderTextColor={theme.colors.text.tertiary}
                autoFocus={true}
              />
           </View>

           <TouchableOpacity 
             style={[styles.submitPayBtn, { backgroundColor: theme.colors.primary, opacity: !paymentAmount.trim() ? 0.6 : 1 }]}
             disabled={!paymentAmount.trim() || updatePayment.isPending}
             onPress={submitPaymentUpdate}
           >
             {updatePayment.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Log Payment</Text>}
           </TouchableOpacity>
        </View>
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
  statusBadge: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  divider: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginLeft: 4, opacity: 0.8 },
  itemRow: { paddingVertical: 12, paddingHorizontal: 8 },
  borderBottom: { borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  payBtn: { height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 16 },
  paymentInputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8 },
  paymentInput: { flex: 1, fontSize: 32, marginLeft: 8, padding: 0 },
  submitPayBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
