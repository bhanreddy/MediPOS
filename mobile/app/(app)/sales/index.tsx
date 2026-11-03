import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceIconButton, WorkspaceEmpty } from '@/components/ui/Workspace';
import { mobileLayout } from '@/theme/mobileLayout';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { LiquidSheen } from '@/components/glass/LiquidGlass';
import { useState, useRef, useMemo } from 'react';
import { useWindowDimensions, View, StyleSheet, ActivityIndicator } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useTheme } from '@/hooks/useTheme';
import { useSales } from '@/hooks/useSales';
import { formatCurrency, formatRelative, formatDate } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Sale } from '@/api/sales';

const PAYMENT_STATUSES = ['All', 'Paid', 'Credit', 'Partial'];

export default function SalesHistoryScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const { medicineId, medicineName } = useLocalSearchParams<{ medicineId?: string; medicineName?: string }>();
  
  const [paymentStatus, setPaymentStatus] = useState('All');
  // Optional simple date placeholders (normally controlled by a true date picker UI)
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const filterSheetRef = useRef<GorhomBottomSheet>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useSales({ 
    limit: 20, 
    payment_status: paymentStatus !== 'All' ? paymentStatus : undefined,
    from: fromDate || undefined,
    to: toDate || undefined,
    medicine_id: medicineId || undefined,
  });

  const sales = useMemo(() => data?.pages.flatMap(p => p.data) || [], [data]);

  const handleApplyFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    filterSheetRef.current?.collapse();
  };

  const handleClearFilter = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPaymentStatus('All');
    setFromDate('');
    setToDate('');
    filterSheetRef.current?.collapse();
  };

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return theme.colors.success;
      case 'partial': return theme.colors.warning;
      case 'credit': return theme.colors.danger;
      default: return theme.colors.primary;
    }
  };

  const renderSale = ({ item }: { item: Sale }) => {
    const isReturn = item.paymentStatus?.toLowerCase() === 'returned';
    const accentColor = getStatusColor(item.paymentStatus);

    return (
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: isReturn ? theme.colors.dangerLight : theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(app)/sales/${item.id}`);
        }}
      >
        <LiquidSheen dark={isDark} />
        <View style={[styles.accentBar, { backgroundColor: accentColor }]} />
        
        {isReturn && (
           <View style={styles.returnStamp}>
             <Text style={styles.returnText}>RETURN</Text>
           </View>
        )}

        <View style={styles.cardContent}>
           <View style={styles.rowBetween}>
             <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 15, color: theme.colors.text.primary }}>
               {item.invoiceNumber}
             </Text>
             <View style={[styles.statusBadge, { backgroundColor: accentColor + '20' }]}>
               <Text style={{ color: accentColor, fontSize: 10, fontFamily: theme.typography.family.bold }}>
                 {item.paymentStatus || 'Paid'}
               </Text>
             </View>
           </View>

           <View style={[styles.rowBetween, { marginVertical: 6 }]}>
             <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }} numberOfLines={1}>
               {item.customerName || 'Walk-in'}
             </Text>
             <Text style={{ color: theme.colors.text.tertiary, fontSize: 12 }}>
               {formatRelative(item.createdAt)}
             </Text>
           </View>

           <View style={styles.rowBetween}>
             <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 16, color: theme.colors.primary }}>
               {formatCurrency(item.grandTotal)}
             </Text>
             <View style={[styles.statusBadge, { backgroundColor: theme.colors.background }]}>
               <Text style={{ color: theme.colors.text.secondary, fontSize: 10, fontFamily: theme.typography.family.medium }}>
                 {item.paymentMode || 'Cash'}
               </Text>
             </View>
           </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <GlassMeshBackground />
       <WorkspaceHeader title={medicineName ? `${medicineName} sales` : "Sales history"} icon="receipt-outline" subtitle="Invoices and payment status" onBack={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')} actions={<WorkspaceIconButton icon="options-outline" label="Filter sales" onPress={() => filterSheetRef.current?.expand()} />}><TouchableOpacity accessibilityRole="button" accessibilityLabel="Choose sales period" style={[styles.dateFilterRange, { backgroundColor: theme.colors.primaryLight }]} onPress={() => filterSheetRef.current?.expand()}><Ionicons name="calendar-outline" size={16} color={theme.colors.primary} /><Text style={{ color: theme.colors.text.secondary, fontSize: 12, marginLeft: 8 }}>{fromDate && toDate ? `${formatDate(fromDate)} – ${formatDate(toDate)}` : "All time"}</Text></TouchableOpacity></WorkspaceHeader>

       <View style={styles.listContainer}>
          {isLoading && !data ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
          ) : (
            <FlashList
              key={layout.listColumns}
              numColumns={layout.listColumns}
              data={sales}
              keyExtractor={(item: Sale) => item.id}
              renderItem={renderSale}
              contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 6, paddingBottom: layout.scrollBottom }}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={<WorkspaceEmpty title="No sales found" description="Try another period or payment filter." icon="receipt-outline" />}
              ListFooterComponent={
                isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={theme.colors.primary} /> : null
              }
            />
          )}
       </View>

       <BottomSheet ref={filterSheetRef} snapPoints={['50%']} title="Filter Sales">
          <View style={styles.sheetContent}>
             <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, marginBottom: 8 }}>Payment Status</Text>
             <View style={styles.pillBox}>
                {PAYMENT_STATUSES.map(status => (
                  <TouchableOpacity 
                    key={status} 
                    style={[styles.pill, { 
                      backgroundColor: paymentStatus === status ? theme.colors.primary : theme.colors.surface,
                      borderColor: paymentStatus === status ? theme.colors.primary : theme.colors.border
                    }]} 
                    onPress={() => { Haptics.selectionAsync(); setPaymentStatus(status); }}
                  >
                    <Text style={{ color: paymentStatus === status ? theme.colors.text.inverse : theme.colors.text.secondary, fontFamily: paymentStatus === status ? theme.typography.family.semiBold : theme.typography.family.regular }}>{status}</Text>
                  </TouchableOpacity>
                ))}
             </View>
             
             {/* Mock Date Selectors - UI representation */}
             <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, marginBottom: 8, marginTop: 16 }}>Date Range</Text>
             <View style={{ flexDirection: 'row', gap: 12, marginBottom: 32 }}>
                <View style={[styles.dateInputBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                   <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>From Date</Text>
                </View>
                <View style={[styles.dateInputBox, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
                   <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>To Date</Text>
                </View>
             </View>

             <View style={{ flexDirection: 'row', gap: 12 }}>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.colors.background, flex: 1 }]} onPress={handleClearFilter}>
                  <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.modalBtn, { backgroundColor: theme.colors.primary, flex: 2 }]} onPress={handleApplyFilter}>
                  <Text style={{ color: theme.colors.text.inverse, fontFamily: theme.typography.family.semiBold }}>Apply Filters</Text>
                </TouchableOpacity>
             </View>
          </View>
       </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingBottom: 12, borderBottomWidth: 0.5 },
  headerTop: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  backBtn: { marginRight: 16 },
  headerTitle: { flex: 1, fontSize: 24 },
  filterBtn: { padding: 4 },
  dateFilterRange: { flexDirection: 'row', alignItems: 'center', height: 36, borderRadius: 8, paddingHorizontal: 12, alignSelf: 'flex-start' },
  listContainer: { flex: 1 },
  card: { borderWidth: 1, flexDirection: 'row', borderRadius: 16, marginHorizontal: 6, marginBottom: 10, overflow: 'hidden' },
  accentBar: { width: 4 },
  cardContent: { flex: 1, padding: 16 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  returnStamp: { position: 'absolute', top: 18, left: 60, opacity: 0.1, transform: [{ rotate: '-15deg' }] },
  returnText: { fontSize: 32, color: '#E53E3E', fontWeight: '900', letterSpacing: 4 },
  sheetContent: { padding: 24 },
  pillBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  dateInputBox: { flex: 1, height: 48, borderRadius: 8, borderWidth: 1, justifyContent: 'center', paddingHorizontal: 16 },
  modalBtn: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
