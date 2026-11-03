import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceSearch, WorkspaceFab, WorkspaceEmpty } from '@/components/ui/Workspace';
import { mobileLayout } from '@/theme/mobileLayout';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { LiquidSheen } from '@/components/glass/LiquidGlass';
import { useState, useRef, useMemo } from 'react';
import { useWindowDimensions, View, StyleSheet, TextInput, ActivityIndicator, Animated } from 'react-native';
import { TouchableOpacity } from 'react-native-gesture-handler';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useTheme } from '@/hooks/useTheme';
 // Wait, need useSuppliers
import { suppliersApi, Supplier } from '@/api/suppliers';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatCurrency, getInitials } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useUIStore } from '@/stores/uiStore';

// Assuming standard hook layout, rewriting explicitly here for robust safety if missing natively
function useSuppliersPaginated(search: string) {
  return useInfiniteQuery({
    queryKey: ['suppliers', search],
    queryFn: ({ pageParam = 1 }) => suppliersApi.getSuppliers({ q: search || undefined, page: pageParam as number }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const { page, totalPages } = lastPage.pagination;
      return page < totalPages ? page + 1 : undefined;
    },
  });
}

export default function SuppliersIndexScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const addToast = useUIStore(s => s.addToast);
  const qc = useQueryClient();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const paymentSheetRef = useRef<GorhomBottomSheet>(null);
  const [activeSupplier, setActiveSupplier] = useState<Supplier | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');

  const { data, isLoading, isFetchingNextPage, hasNextPage, fetchNextPage } = useSuppliersPaginated(debouncedSearch);

  const paymentMutation = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) => suppliersApi.recordSupplierPayment(id, amount),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['suppliers'] });
      addToast('Payment recorded securely', 'success');
      paymentSheetRef.current?.collapse();
      setPaymentAmount('');
    },
    onError: () => addToast('Failed to record payment', 'error')
  });

  const suppliers = useMemo(() => data?.pages.flatMap(p => p.data) || [], [data]);

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  };

  const renderRightActions = (progress: any, dragX: any, supplier: Supplier) => {
    if (supplier.outstandingBalance <= 0) return null;
    
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    return (
      <TouchableOpacity 
         style={[styles.swipeAction, { backgroundColor: theme.colors.success }]} 
         onPress={() => {
           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
           setActiveSupplier(supplier);
           paymentSheetRef.current?.expand();
         }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="cash-outline" size={24} color={theme.colors.text.inverse} />
          <Text style={[styles.actionText, { color: theme.colors.text.inverse }]}>Pay Now</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const submitPayment = () => {
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0 || !activeSupplier) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    paymentMutation.mutate({ id: activeSupplier.id, amount: amt });
  };

  const renderSupplier = ({ item }: { item: Supplier }) => (
    <Swipeable renderRightActions={(p, d) => renderRightActions(p, d, item)} friction={2}>
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}
        onPress={() => router.push(`/(app)/suppliers/${item.id}`)}
      >
        <LiquidSheen dark={isDark} />
        <View style={[styles.avatar, { backgroundColor: theme.colors.accentLight }]}>
          <Text style={[styles.avatarText, { color: theme.colors.accent, fontFamily: theme.typography.family.bold }]}>
            {getInitials(item.name)}
          </Text>
        </View>
        <View style={styles.centerCol}>
           <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 15, color: theme.colors.text.primary, marginBottom: 2 }}>{item.name}</Text>
           <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{item.phone} • {item.email || 'N/A'}</Text>
        </View>
        <View style={styles.rightCol}>
           <Text style={{ 
             fontFamily: theme.typography.family.bold, fontSize: 16, 
             color: item.outstandingBalance > 0 ? theme.colors.danger : theme.colors.success 
           }}>
             {formatCurrency(item.outstandingBalance)}
           </Text>
           <Text style={{ color: theme.colors.text.secondary, fontSize: 11, textAlign: 'right' }}>Payable</Text>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <GlassMeshBackground />
      <WorkspaceHeader title="Suppliers" icon="business-outline" subtitle="Contacts and outstanding balances" onBack={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')}><WorkspaceSearch label="Search suppliers" value={search} onChangeText={handleSearch} /></WorkspaceHeader>

      <View style={{ flex: 1 }}>
        {isLoading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
        ) : (
          <FlashListAny
              key={layout.listColumns}
              numColumns={layout.listColumns}
            data={suppliers}
            keyExtractor={(i: Supplier) => i.id}
            estimatedItemSize={84}
            renderItem={renderSupplier}
            contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 6, paddingBottom: insets.bottom + 88 }}
            onEndReached={() => hasNextPage && !isFetchingNextPage && fetchNextPage()}
            onEndReachedThreshold={0.5}
            ListEmptyComponent={<WorkspaceEmpty title="No suppliers found" description="Try another search or review your supplier list." icon="business-outline" />}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={theme.colors.primary} /> : null}
          />
        )}
      </View>

      <WorkspaceFab label="Add supplier" onPress={() => router.push('/(app)/suppliers/add')} bottom={insets.bottom + 20} />

      <BottomSheet ref={paymentSheetRef} snapPoints={['45%']} title="Record Payment">
         <View style={{ padding: 24 }}>
            <Text style={{ color: theme.colors.text.secondary }}>Paying to <Text style={{ fontFamily: theme.typography.family.bold }}>{activeSupplier?.name}</Text></Text>
            <View style={[styles.paymentInputRow, { borderColor: theme.colors.border }]}>
               <Text style={{ fontSize: 24, color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>₹</Text>
               <TextInput
                 style={[styles.paymentInput, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}
                 keyboardType="numeric"
                 value={paymentAmount}
                 onChangeText={setPaymentAmount}
                 placeholder={activeSupplier?.outstandingBalance.toString()}
                 placeholderTextColor={theme.colors.text.tertiary}
                 autoFocus={true}
               />
            </View>
            <TouchableOpacity 
              style={[styles.submitPayBtn, { backgroundColor: theme.colors.primary, opacity: !paymentAmount ? 0.6 : 1 }]}
              disabled={!paymentAmount || paymentMutation.isPending}
              onPress={submitPayment}
            >
              {paymentMutation.isPending ? <ActivityIndicator color={theme.colors.text.inverse} /> : <Text style={{ color: theme.colors.text.inverse, fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Confirm Payment</Text>}
            </TouchableOpacity>
         </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  searchBar: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, paddingHorizontal: 12 },
  card: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 14, marginHorizontal: 6, marginBottom: 10 },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 16 },
  centerCol: { flex: 1 },
  rightCol: { alignItems: 'flex-end', marginLeft: 8 },
  swipeAction: { justifyContent: 'center', alignItems: 'flex-end', width: 90, borderRadius: 12, marginBottom: 10, marginRight: 16, paddingHorizontal: 20 },
  actionText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginTop: 4 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  paymentInputRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, paddingBottom: 8, marginTop: 24, marginBottom: 32 },
  paymentInput: { flex: 1, fontSize: 32, marginLeft: 8, padding: 0 },
  submitPayBtn: { minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
