import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Linking, TextInput } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useTheme } from '@/hooks/useTheme';
import { useCustomer, useRecordPayment } from '@/hooks/useCustomers';
import { formatCurrency, formatDate, getInitials } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useCartStore } from '@/stores/cartStore';

export default function PatientDetailScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { id, action } = useLocalSearchParams<{ id: string; action?: string }>();

  const { data: customerData, isLoading: isLoadingCust } = useCustomer(id as string);
  const recordPayment = useRecordPayment();
  const setCustomer = useCartStore((s) => s.setCustomer);
  
  const bottomSheetRef = useRef<GorhomBottomSheet>(null);
  
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const MODES = ['Cash', 'Card', 'UPI'];

  // Automatically trigger payment bottom sheet if arriving from swipe gesture
  React.useEffect(() => {
    if (action === 'payment') {
      setTimeout(() => bottomSheetRef.current?.expand(), 500);
    }
  }, [action]);

  if (isLoadingCust || !customerData) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  const { customer, recent_sales = [] } = customerData;
  const score = customer.importanceScore ?? 0;
  const starsFilled = Math.round(score / 20);

  const handleWhatsApp = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const sanitizedPhone = customer.phone.replace(/\D/g, '');
    const url = `whatsapp://send?phone=${sanitizedPhone}&text=Hello%20${encodeURIComponent(customer.name)}`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
    });
  };

  const handleNewSale = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCustomer(customer as any); // Or use what cartStore needs, it usually takes Customer object or ID
    router.push('/(app)/(tabs)/pos');
  };

  const submitPayment = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;

    const modeMap: Record<string, 'cash' | 'upi' | 'card' | 'bank_transfer'> = {
      Cash: 'cash',
      Card: 'card',
      UPI: 'upi',
    };
    const payment_mode = modeMap[paymentMode] ?? 'cash';
    recordPayment.mutate({ id: customer.id, body: { amount: amt, payment_mode } }, {
      onSuccess: () => {
        bottomSheetRef.current?.collapse();
        setPaymentAmount('');
      }
    });
  };

  const renderRecentSale = ({ item }: { item: { invoiceNumber: string; saleDate: string; netAmount: number; status: string } }) => {
    let statusColor = theme.colors.success;
    if (item.status === 'Credit') statusColor = theme.colors.danger;
    else if (item.status === 'Partial') statusColor = theme.colors.warning;

    return (
      <View style={[styles.saleRow, { borderBottomColor: theme.colors.border }]}>
        <View>
          <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>{item.invoiceNumber}</Text>
          <Text style={{ fontSize: 12, color: theme.colors.text.secondary }}>{formatDate(item.saleDate)}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>{formatCurrency(item.netAmount)}</Text>
          <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
            <Text style={{ color: statusColor, fontSize: 10, fontFamily: theme.typography.family.bold }}>{item.status}</Text>
          </View>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 60 }} bounces={false}>
         {/* Profile Banner */}
         <View style={[styles.bannerCard, { backgroundColor: theme.colors.primaryLight, paddingTop: insets.top + 16 }]}>
            <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
              <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
            </TouchableOpacity>

            <View style={styles.bannerCenter}>
               <View style={[styles.avatarBig, { backgroundColor: theme.colors.primary }]}>
                 <Text style={[styles.avatarTextBig, { fontFamily: theme.typography.family.bold, color: '#FFF' }]}>{getInitials(customer.name)}</Text>
               </View>
               <Text style={[styles.bannerName, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>{customer.name}</Text>
               <View style={styles.starsRow}>
                  {[1,2,3,4,5].map(s => (
                    <Ionicons key={s} name="star" size={18} color={s <= starsFilled ? '#FBBF24' : '#E2E8F0'} style={{ marginHorizontal: 2 }} />
                  ))}
               </View>
               <View style={styles.contactRow}>
                 <Ionicons name="call-outline" size={14} color={theme.colors.text.secondary} />
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 13, marginRight: 12, marginLeft: 4 }}>{customer.phone}</Text>
                 {customer.email ? (
                   <>
                     <Ionicons name="mail-outline" size={14} color={theme.colors.text.secondary} />
                     <Text style={{ color: theme.colors.text.secondary, fontSize: 13, marginLeft: 4 }}>{customer.email}</Text>
                   </>
                 ) : null}
               </View>
            </View>

            <View style={styles.statsRow}>
               <View style={[styles.statBox, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 11, marginBottom: 2 }}>{`Total\nPurchases`}</Text>
                 <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>{formatCurrency(12050)}</Text>
               </View>
               <View style={[styles.statBox, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 11, marginBottom: 2 }}>{`Pending\nBalance`}</Text>
                 <Text style={{ color: customer.outstandingBalance > 0 ? theme.colors.danger : theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>{formatCurrency(customer.outstandingBalance)}</Text>
               </View>
               <View style={[styles.statBox, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 11, marginBottom: 2 }}>{`Member\nSince`}</Text>
                 <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }}>{new Date(customer.createdAt).getFullYear()}</Text>
               </View>
            </View>
         </View>

         {/* Outstanding Danger Section */}
         {customer.outstandingBalance > 0 && (
           <View style={[styles.outstandingCard, { backgroundColor: theme.colors.dangerLight, borderColor: theme.colors.danger }]}>
              <View>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.medium }}>Current Outstanding</Text>
                <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.bold, fontSize: 24, marginTop: 4 }}>
                  {formatCurrency(customer.outstandingBalance)}
                </Text>
              </View>
              <TouchableOpacity 
                style={[styles.recordBtn, { backgroundColor: theme.colors.danger }]} 
                onPress={() => bottomSheetRef.current?.expand()}
              >
                 <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 13 }}>Record Payment</Text>
              </TouchableOpacity>
           </View>
         )}

         {/* Quick Actions */}
         <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
           <Text style={[styles.sectionTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]}>Quick Actions</Text>
           <View style={styles.quickActionsRow}>
              <TouchableOpacity style={[styles.qaBtn, { borderColor: theme.colors.primary }]} onPress={handleNewSale}>
                 <Ionicons name="cart-outline" size={20} color={theme.colors.primary} />
                 <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.medium, marginLeft: 8 }}>New Sale</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.qaBtn, { borderColor: '#10B981' }]} onPress={handleWhatsApp}>
                 <Ionicons name="logo-whatsapp" size={20} color="#10B981" />
                 <Text style={{ color: '#10B981', fontFamily: theme.typography.family.medium, marginLeft: 8 }}>Message</Text>
              </TouchableOpacity>
           </View>
         </View>

         {/* Purchase History */}
         <View style={{ paddingHorizontal: 16, marginTop: 24 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
               <Text style={[styles.sectionTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, marginBottom: 0 }]}>Purchase History</Text>
               <TouchableOpacity><Text style={{ color: theme.colors.primary, fontSize: 13 }}>View All</Text></TouchableOpacity>
            </View>
            <View style={[styles.historyContainer, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
              {recent_sales.length > 0 ? (
                <FlashListAny
                  data={recent_sales}
                  keyExtractor={(item: any) => item.id || item.invoiceNumber}
                  estimatedItemSize={60}
                  renderItem={renderRecentSale}
                />
              ) : (
                <Text style={{ padding: 16, textAlign: 'center', color: theme.colors.text.tertiary }}>No purchases recorded.</Text>
              )}
            </View>
         </View>
      </ScrollView>

      {/* Record Payment Bottom Sheet */}
      <BottomSheet ref={bottomSheetRef} snapPoints={['50%']} title="Record Payment">
        <View style={{ padding: 24 }}>
           <Text style={{ color: theme.colors.text.secondary, marginBottom: 8 }}>Payment Amount</Text>
           <View style={[styles.paymentInputRow, { borderColor: theme.colors.border }]}>
              <Text style={{ fontSize: 24, color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>₹</Text>
              <TextInput
                style={[styles.paymentInput, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}
                keyboardType="numeric"
                value={paymentAmount}
                onChangeText={setPaymentAmount}
                placeholder="0.00"
                placeholderTextColor={theme.colors.text.tertiary}
                autoFocus={true}
              />
           </View>
           
           <Text style={{ color: theme.colors.text.secondary, marginBottom: 8, marginTop: 20 }}>Payment Mode</Text>
           <View style={{ flexDirection: 'row', gap: 8, marginBottom: 32 }}>
             {MODES.map(mode => (
               <TouchableOpacity 
                 key={mode} 
                 style={[styles.pmodeBtn, { 
                   backgroundColor: paymentMode === mode ? theme.colors.primary : theme.colors.surface,
                   borderColor: paymentMode === mode ? theme.colors.primary : theme.colors.border 
                 }]}
                 onPress={() => setPaymentMode(mode)}
               >
                 <Text style={{ 
                   color: paymentMode === mode ? '#FFF' : theme.colors.text.primary,
                   fontFamily: paymentMode === mode ? theme.typography.family.semiBold : theme.typography.family.regular
                 }}>{mode}</Text>
               </TouchableOpacity>
             ))}
           </View>

           <TouchableOpacity 
             style={[styles.submitPayBtn, { backgroundColor: theme.colors.primary, opacity: !paymentAmount ? 0.6 : 1 }]}
             disabled={!paymentAmount || recordPayment.isPending}
             onPress={submitPayment}
           >
             {recordPayment.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Confirm Payment</Text>}
           </TouchableOpacity>
        </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  bannerCard: { borderBottomLeftRadius: 32, borderBottomRightRadius: 32, paddingHorizontal: 20, paddingBottom: 24, marginBottom: 12 },
  backBtn: { position: 'absolute', top: 50, left: 20, zIndex: 10 },
  bannerCenter: { alignItems: 'center', marginTop: 12 },
  avatarBig: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 12, borderWidth: 4, borderColor: '#FFF' },
  avatarTextBig: { fontSize: 32 },
  bannerName: { fontSize: 24, marginBottom: 6 },
  starsRow: { flexDirection: 'row', marginBottom: 8 },
  contactRow: { flexDirection: 'row', alignItems: 'center', opacity: 0.8 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 24, gap: 12 },
  statBox: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  outstandingCard: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginHorizontal: 16, padding: 20, borderRadius: 16, borderWidth: 1, marginTop: 12 },
  recordBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  sectionTitle: { fontSize: 16, marginBottom: 12 },
  quickActionsRow: { flexDirection: 'row', gap: 12 },
  qaBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', height: 48, borderRadius: 12, borderWidth: 1.5 },
  historyContainer: { backgroundColor: '#FFF', borderRadius: 16, minHeight: 120, overflow: 'hidden' },
  saleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, marginTop: 4 },
  paymentInputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8 },
  paymentInput: { flex: 1, fontSize: 32, marginLeft: 8, padding: 0 },
  pmodeBtn: { flex: 1, height: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8, borderWidth: 1 },
  submitPayBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
