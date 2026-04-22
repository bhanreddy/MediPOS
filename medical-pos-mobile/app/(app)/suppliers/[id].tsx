import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useTheme } from '@/hooks/useTheme';
import { suppliersApi, Supplier } from '@/api/suppliers';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, formatDate } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useUIStore } from '@/stores/uiStore';
import { getInitials } from '@/utils/format';

function useSupplier(id: string) {
  return useQuery({ queryKey: ['supplier', id], queryFn: () => suppliersApi.getSupplier(id) });
}

function useSupplierOutstanding(id: string) {
  return useQuery({ queryKey: ['supplier-outstanding', id], queryFn: () => suppliersApi.getSupplierOutstanding(id) });
}

export default function SupplierDetailScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const addToast = useUIStore(s => s.addToast);
  const qc = useQueryClient();

  const { data: supplier, isLoading } = useSupplier(id as string);
  const { data: outstanding, isLoading: isLoadingOut } = useSupplierOutstanding(id as string);

  const paymentSheetRef = useRef<GorhomBottomSheet>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const paymentMutation = useMutation({
    mutationFn: (amount: number) => suppliersApi.recordSupplierPayment(id as string, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['supplier', id] });
      qc.invalidateQueries({ queryKey: ['supplier-outstanding', id] });
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      addToast('Payment recorded securely', 'success');
      paymentSheetRef.current?.collapse();
      setPaymentAmount('');
    },
    onError: () => addToast('Failed to log payment', 'error')
  });

  const submitPayment = () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    paymentMutation.mutate(amt);
  };

  if (isLoading || isLoadingOut || !supplier) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
         <View style={[styles.headerLite, { backgroundColor: theme.colors.surface }]}>
           <TouchableOpacity onPress={() => router.back()} style={{ padding: 8 }}>
             <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
           </TouchableOpacity>
           <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 18, color: theme.colors.text.primary }}>Supplier Profile</Text>
           <View style={{ width: 40 }} />
         </View>

         <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
            {/* Header Box */}
            <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, alignItems: 'center' }]}>
               <View style={[styles.avatarLg, { backgroundColor: theme.colors.accentLight }]}>
                 <Text style={{ color: theme.colors.accent, fontFamily: theme.typography.family.bold, fontSize: 32 }}>{getInitials(supplier.name)}</Text>
               </View>
               <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 24, color: theme.colors.text.primary, marginTop: 12 }}>{supplier.name}</Text>
               <Text style={{ color: theme.colors.text.secondary, fontSize: 14, marginTop: 4 }}>Added {formatDate(supplier.createdAt)}</Text>
               
               <View style={{ flexDirection: 'row', marginTop: 16, width: '100%' }}>
                  <View style={[styles.infoBlock, { borderRightWidth: 1, borderColor: theme.colors.border }]}>
                     <Ionicons name="call-outline" size={16} color={theme.colors.text.secondary} />
                     <Text style={{ fontFamily: theme.typography.family.medium, marginTop: 4, color: theme.colors.text.primary }}>{supplier.phone}</Text>
                  </View>
                  <View style={[styles.infoBlock, { borderRightWidth: 1, borderColor: theme.colors.border }]}>
                     <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>GSTIN</Text>
                     <Text style={{ fontFamily: theme.typography.family.medium, marginTop: 4, color: theme.colors.text.primary, fontSize: 12 }}>{supplier.gstNumber || 'N/A'}</Text>
                  </View>
                  <View style={styles.infoBlock}>
                     <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>Email</Text>
                     <Text style={{ fontFamily: theme.typography.family.medium, marginTop: 4, color: theme.colors.text.primary, fontSize: 11 }} numberOfLines={1}>{supplier.email || 'N/A'}</Text>
                  </View>
               </View>
            </View>

            {/* Address */}
            <Text style={styles.sectionTitle}>Business Address</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, paddingVertical: 12 }]}>
               <Text style={{ color: theme.colors.text.primary, lineHeight: 22 }}>{supplier.address || 'No address provided.'}</Text>
            </View>

            {/* Outstanding Balance */}
            <Text style={styles.sectionTitle}>Outstanding Ledger</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, padding: 20 }]}>
               <View style={styles.rowBetween}>
                  <Text style={{ color: theme.colors.text.secondary, fontSize: 15 }}>Total Payable Balance</Text>
                  <Text style={{ 
                    fontFamily: theme.typography.family.bold, fontSize: 22, 
                    color: supplier.outstandingBalance > 0 ? theme.colors.danger : theme.colors.success 
                  }}>
                    {formatCurrency(supplier.outstandingBalance)}
                  </Text>
               </View>
               {supplier.outstandingBalance > 0 && (
                 <TouchableOpacity 
                    style={[styles.payBtn, { backgroundColor: theme.colors.danger }]} 
                    onPress={() => paymentSheetRef.current?.expand()}
                 >
                    <Ionicons name="card-outline" size={18} color="#FFF" style={{ marginRight: 8 }} />
                    <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold }}>Clear Outstanding</Text>
                 </TouchableOpacity>
               )}
            </View>

            {/* Recent Purchases */}
            <Text style={styles.sectionTitle}>Unpaid Bills</Text>
            <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, paddingVertical: 8 }]}>
               {outstanding?.bills && outstanding.bills.length > 0 ? (
                  outstanding.bills.map((bill, index) => (
                    <View key={bill.purchaseId} style={[styles.billRow, index !== outstanding.bills.length - 1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}>
                       <View>
                          <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>Inv: {bill.billNumber}</Text>
                          <Text style={{ fontSize: 12, color: theme.colors.text.secondary, marginTop: 4 }}>Due: {formatDate(bill.dueDate)}</Text>
                       </View>
                       <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.primary }}>{formatCurrency(bill.amount)}</Text>
                    </View>
                 ))
               ) : (
                 <Text style={{ color: theme.colors.text.tertiary, padding: 8, textAlign: 'center' }}>No outstanding bills.</Text>
               )}
            </View>
         </ScrollView>

         <BottomSheet ref={paymentSheetRef} snapPoints={['45%']} title="Record Payment">
           <View style={{ padding: 24 }}>
              <Text style={{ color: theme.colors.text.secondary }}>Logging payment towards <Text style={{ fontFamily: theme.typography.family.bold }}>{supplier.name}</Text></Text>
              <View style={[styles.paymentInputRow, { borderColor: theme.colors.border }]}>
                 <Text style={{ fontSize: 24, color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>₹</Text>
                 <TextInput
                   style={[styles.paymentInput, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}
                   keyboardType="numeric"
                   value={paymentAmount}
                   onChangeText={setPaymentAmount}
                   placeholder={supplier.outstandingBalance.toString()}
                   placeholderTextColor={theme.colors.text.tertiary}
                   autoFocus={true}
                 />
              </View>
              <TouchableOpacity 
                style={[styles.submitPayBtn, { backgroundColor: theme.colors.primary, opacity: !paymentAmount ? 0.6 : 1 }]}
                disabled={!paymentAmount || paymentMutation.isPending}
                onPress={submitPayment}
              >
                {paymentMutation.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Confirm Settlement</Text>}
              </TouchableOpacity>
           </View>
         </BottomSheet>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  headerLite: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingBottom: 12, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  card: { borderRadius: 16, padding: 16, marginBottom: 20 },
  avatarLg: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  infoBlock: { flex: 1, alignItems: 'center', paddingVertical: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8, marginLeft: 4, opacity: 0.8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  payBtn: { flexDirection: 'row', height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 24 },
  billRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8 },
  paymentInputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8, marginTop: 24, marginBottom: 32 },
  paymentInput: { flex: 1, fontSize: 32, marginLeft: 8, padding: 0 },
  submitPayBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
