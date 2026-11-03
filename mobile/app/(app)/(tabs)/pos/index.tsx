import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceSearch, WorkspaceIconButton, WorkspaceChip } from '@/components/ui/Workspace';
import { mobileLayout } from '@/theme/mobileLayout';
import { ProductCard } from '@/components/pos/ProductCard';

import { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, useWindowDimensions, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable, TouchableOpacity, ScrollView } from 'react-native-gesture-handler';

import { useTheme } from '@/hooks/useTheme';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useMedicines, useSearchMedicines } from '@/hooks/useInventory';
import { useCreateSale } from '@/hooks/useSales';
import { useCartStore, PaymentMode } from '@/stores/cartStore';
import { formatCurrency } from '@/utils/format';
import { pickSellableBatch } from '@/utils/batchSelection';
import type { Medicine } from '@/api/inventory';
import type { CreateSaleBody } from '@/api/sales';
import { buildCreateSalePayload } from '@/api/sales';
import { UpiPaymentSheet, type UpiModalState } from '@/components/pos/UpiPaymentSheet';
import { useUpiId } from '@/hooks/useUpiId';
import { useShopDisplayName } from '@/hooks/useShopDisplayName';
import { buildUpiPaymentUri } from '@/lib/upiPaymentUri';

/* ─── Types and Constants ─── */

const CATEGORIES = ['All', 'Tablet', 'Syrup', 'Injection', 'Capsule', 'Cream', 'Drops', 'Other'];

type ListItem =
  | { type: 'product'; item: Medicine }
  | { type: 'substitute'; item: Medicine }
  | { type: 'header'; title: string };

const listItemKey = (item: ListItem) => item.type === 'header' ? 'header' : item.type + '_' + item.item.id;
const listItemType = (item: ListItem) => item.type;

/**
 * Checkout payload aligned with web BillingService + backend POST /sales.
 */
function buildCheckoutPayload(cartStore: ReturnType<typeof useCartStore.getState>): CreateSaleBody {
  return buildCreateSalePayload({
    ...(cartStore.customerId ? { customer_id: cartStore.customerId } : {}),
    discount: cartStore.getDiscountAmount(),
    payment_mode: cartStore.paymentMode,
    payment_status: cartStore.paymentMode === 'credit' ? 'credit' : 'paid',
    paid_amount: 0,
    items: cartStore.items.map((i) => ({
      medicine_id: i.product.id,
      batch_id: i.batchId,
      quantity: i.qty,
      mrp: i.mrp,
      discount_pct: i.discountPct ?? 0,
      gst_rate: i.gstRate ?? 0,
    })),
  });
}

/* ─── Main Component ─── */

export default function PosScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const salePanelWidth = 340;
  const numColumns = layout.wide ? mobileLayout(width - salePanelWidth, fontScale).productColumns : layout.productColumns;
  const gridPadding = useMemo(() => [styles.flashListContent, { paddingBottom: layout.scrollBottom }], [layout.scrollBottom]);
  const productSpan = useCallback((cell: { span?: number }, item: ListItem) => { cell.span = item.type === 'header' ? numColumns : 1; }, [numColumns]);

  // Local State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isSubstitutesExpanded, setIsSubstitutesExpanded] = useState(true);
  const [upiModal, setUpiModal] = useState<UpiModalState>('closed');
  const [pendingUpiAmount, setPendingUpiAmount] = useState(0);
  const [upiQrValue, setUpiQrValue] = useState('');

  // Refs
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cartSheetRef = useRef<any>(null);

  // Stores & Mutations
  const cartStore = useCartStore();
  const createSaleMutation = useCreateSale();
  const { upiId } = useUpiId();
  const shopName = useShopDisplayName();

  // Queries
  const isSearchActive = debouncedQuery.length >= 2;
  const { data: allMedicinesData, isLoading: isLoadingAll } = useMedicines(
    !isSearchActive ? { category: selectedCategory === 'All' ? undefined : selectedCategory } : undefined
  );
  const { data: searchData, isLoading: isLoadingSearch } = useSearchMedicines(
    isSearchActive ? debouncedQuery : ''
  );

  const isLoading = isSearchActive ? isLoadingSearch : isLoadingAll;

  useEffect(() => () => {
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
  }, []);
  const cartByProduct = useMemo(() => {
    const result = new Map<string, typeof cartStore.items[number]>();
    for (const line of cartStore.items) if (!result.has(line.product.id)) result.set(line.product.id, line);
    return result;
  }, [cartStore.items]);

  // Search Debounce Handler
  const handleSearchChange = (text: string) => {
    setSearchQuery(text);
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => {
      setDebouncedQuery(text);
    }, 250);
  };

  // Build List Data
  const listData = useMemo<ListItem[]>(() => {
    if (isSearchActive && searchData) {
      const data: ListItem[] = [];
      if (searchData.results?.length) {
        data.push(...searchData.results.map((item) => ({ type: 'product' as const, item })));
      }
      if (searchData.substitutes?.length && isSubstitutesExpanded) {
        data.push({ type: 'header', title: `Generic substitutes available (${searchData.substitutes.length})` });
        data.push(...searchData.substitutes.map((item) => ({ type: 'substitute' as const, item })));
      }
      return data;
    }

    if (!isSearchActive && allMedicinesData) {
      return allMedicinesData.map((item) => ({ type: 'product', item }));
    }

    return [];
  }, [isSearchActive, searchData, allMedicinesData, isSubstitutesExpanded]);

  // Cart Handlers
  const handleAddToCart = useCallback((product: Medicine) => {
    const defaultBatch = pickSellableBatch(product.medicine_batches);
    if (!defaultBatch || defaultBatch.quantity <= 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    useCartStore.getState().addItem({
      product: {
        id: product.id,
        name: product.name,
        genericName: product.genericName,
        manufacturer: product.manufacturer,
        schedule: product.schedule,
      },
      batchId: defaultBatch.id,
      qty: 1,
      mrp: defaultBatch.mrp,
      discountPct: 0,
      gstRate: product.gstRate,
      maxQty: defaultBatch.quantity,
    });
  }, []);

  const handleUpdateQty = useCallback((batchId: string, increment: number, currentQty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newQty = currentQty + increment;
    if (newQty <= 0) {
      useCartStore.getState().removeItem(batchId);
    } else {
      useCartStore.getState().updateQty(batchId, newQty);
    }
  }, []);

  const cartItemCount = cartStore.getItemCount();

  const closeCartSheet = useCallback(() => {
    cartSheetRef.current?.close();
  }, []);

  /** Cart sheet must not stay open when leaving POS (e.g. after print → home → + FAB). */
  useFocusEffect(
    useCallback(() => {
      closeCartSheet();
      return () => {
        closeCartSheet();
      };
    }, [closeCartSheet]),
  );

  useEffect(() => {
    if (upiModal === 'qr' && upiId && pendingUpiAmount > 0) {
      setUpiQrValue(
        buildUpiPaymentUri({
          vpa: upiId,
          payeeName: shopName,
          amount: pendingUpiAmount,
        }),
      );
    } else {
      setUpiQrValue('');
    }
  }, [upiModal, upiId, pendingUpiAmount, shopName]);

  const closeUpiModal = useCallback(() => {
    setUpiModal('closed');
    setPendingUpiAmount(0);
  }, []);

  const executeSale = useCallback(() => {
    const payload = buildCheckoutPayload(cartStore);

    createSaleMutation.mutate(payload, {
      onSuccess: (data) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        closeUpiModal();
        cartStore.clearCart();
        closeCartSheet();
        router.replace({ pathname: '/(app)/sale-success', params: { id: data.localId } });
      },
    });
  }, [cartStore, createSaleMutation, closeCartSheet, closeUpiModal]);

  const handleCheckout = useCallback(() => {
    if (cartStore.items.length === 0) return;

    if (cartStore.paymentMode === 'credit' && !cartStore.customerId) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    if (cartStore.paymentMode === 'upi') {
      const amount = Math.round(cartStore.getTotal() * 100) / 100;
      if (!upiId.trim()) {
        setPendingUpiAmount(amount);
        setUpiModal('missing_config');
        return;
      }
      setPendingUpiAmount(amount);
      setUpiModal('qr');
      return;
    }

    executeSale();
  }, [cartStore, upiId, executeSale]);

  // Renderers
  const renderItem = useCallback(({ item }: { item: ListItem }) => {
    if (item.type === 'header') {
      return (
        <TouchableOpacity
          style={styles.substituteHeader}
          onPress={() => setIsSubstitutesExpanded(!isSubstitutesExpanded)}
        >
          <Text style={[styles.substituteHeaderText, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]}>
            {item.title}
          </Text>
          <Ionicons name={isSubstitutesExpanded ? 'chevron-up' : 'chevron-down'} size={20} color={theme.colors.text.secondary} />
        </TouchableOpacity>
      );
    }

    return <ProductCard product={item.item} substitute={item.type === 'substitute'} cartItem={cartByProduct.get(item.item.id)} onAdd={handleAddToCart} onQuantity={handleUpdateQty} />;
  }, [theme, cartByProduct, isSubstitutesExpanded, handleAddToCart, handleUpdateQty]);

  const cartContent = (
    <>

         <View style={styles.cartSheetHeader}>
           <TouchableOpacity accessibilityRole="button" accessibilityLabel="Clear current sale" style={{ minHeight: 44, minWidth: 44, justifyContent: 'center' }} onPress={() => cartStore.clearCart()}>
              <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.medium }}>Clear</Text>
           </TouchableOpacity>
         </View>

         {cartStore.items.length === 0 ? (
           <View style={styles.emptyCart}>
             <Ionicons name="cart-outline" size={48} color={theme.colors.text.tertiary} />
             <Text style={{ color: theme.colors.text.secondary, marginTop: 12 }}>Cart is empty</Text>
           </View>
         ) : (
           <View style={{ flex: 1 }}>
              <FlashList
                data={cartStore.items}
                keyExtractor={(item: any) => item.batchId}
                renderItem={({ item }: { item: typeof cartStore.items[0] }) => (
                  <Swipeable
                    renderRightActions={() => (
                      <TouchableOpacity style={[styles.deleteAction, { backgroundColor: theme.colors.danger }]} onPress={() => cartStore.removeItem(item.batchId)}>
                         <Ionicons name="trash-outline" size={24} color={theme.colors.text.inverse} />
                      </TouchableOpacity>
                    )}
                  >
                    <View style={[styles.cartItemRow, layout.compact && { flexDirection: 'column', alignItems: 'stretch', gap: 12 }, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                      {!layout.compact && !layout.wide && <View style={[styles.cartItemInitials, { backgroundColor: theme.colors.primaryLight }]}>
                        <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold }}>{item.product.name.charAt(0)}</Text>
                      </View>}
                      <View style={styles.cartItemDetails}>
                        <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{item.product.name}</Text>
                        <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.regular, fontSize: 12 }}>
                          {formatCurrency(item.mrp)} / unit
                        </Text>
                      </View>
                      <View style={[styles.cartStepper, { alignSelf: 'flex-start', borderColor: theme.colors.border }]}>
                        <TouchableOpacity onPress={() => handleUpdateQty(item.batchId, -1, item.qty)} style={styles.cartStepperBtnHoriz}>
                          <Ionicons name="remove" size={16} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                        <Text style={{ marginHorizontal: 8, fontFamily: theme.typography.family.medium, color: theme.colors.text.primary }}>{item.qty}</Text>
                        <TouchableOpacity onPress={() => handleUpdateQty(item.batchId, 1, item.qty)} style={styles.cartStepperBtnHoriz}>
                          <Ionicons name="add" size={16} color={theme.colors.text.primary} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </Swipeable>
                )}
              />

              <View style={[styles.cartSummary, { borderTopColor: theme.colors.border }]}>
                 {/* Payment Modes */}
                 <View style={styles.paymentRow}>
                   {(['cash', 'card', 'upi', 'credit'] as PaymentMode[]).map(mode => (
                     <TouchableOpacity 
                       key={mode} 
                       style={[styles.paymentPill, { backgroundColor: cartStore.paymentMode === mode ? theme.colors.primary : theme.colors.background }]}
                       onPress={() => cartStore.setPaymentMode(mode)}
                     >
                       <Text style={{ color: cartStore.paymentMode === mode ? theme.colors.text.inverse : theme.colors.text.secondary, fontFamily: theme.typography.family.medium, textTransform: 'capitalize' }}>{mode}</Text>
                     </TouchableOpacity>
                   ))}
                 </View>

                 {/* Totals */}
                 <View style={styles.totalsBox}>
                   <View style={styles.totalRow}>
                     <Text style={{ color: theme.colors.text.secondary }}>Subtotal</Text>
                     <Text style={{ color: theme.colors.text.primary }}>{formatCurrency(cartStore.getSubtotal())}</Text>
                   </View>
                   {cartStore.discountPct > 0 && (
                     <View style={styles.totalRow}>
                       <Text style={{ color: theme.colors.text.secondary }}>Discount ({cartStore.discountPct}%)</Text>
                       <Text style={{ color: theme.colors.danger }}>-{formatCurrency(cartStore.getDiscountAmount())}</Text>
                     </View>
                   )}
                   <View style={styles.totalRow}>
                     <Text style={{ color: theme.colors.text.secondary }}>GST</Text>
                     <Text style={{ color: theme.colors.text.primary }}>+{formatCurrency(cartStore.getGstTotal())}</Text>
                   </View>
                   <View style={[styles.totalRow, { marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.border }]}>
                     <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold, fontSize: 16 }}>Net Total</Text>
                     <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 18 }}>{formatCurrency(cartStore.getTotal())}</Text>
                   </View>
                 </View>

                 <TouchableOpacity 
                   style={[styles.checkoutBtn, { backgroundColor: theme.colors.primary, opacity: createSaleMutation.isPending ? 0.7 : 1 }]} 
                   onPress={handleCheckout}
                   disabled={createSaleMutation.isPending}
                 >
                   {createSaleMutation.isPending ? (
                     <ActivityIndicator color={theme.colors.text.inverse} />
                   ) : (
                     <Text style={[styles.checkoutBtnText, { color: theme.colors.text.inverse, fontFamily: theme.typography.family.semiBold }]}>Proceed to Checkout</Text>
                   )}
                 </TouchableOpacity>
              </View>
           </View>
         )}

    </>
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <GlassMeshBackground />
      {/* Header */}
      <WorkspaceHeader title="Point of sale" icon="receipt-outline" subtitle="Invoices and payments" actions={!layout.wide ? <WorkspaceIconButton icon="cart-outline" label="Current sale" badge={cartItemCount} onPress={() => cartSheetRef.current?.expand()} /> : undefined}>
        <WorkspaceSearch label="Search medicines" placeholder="Search medicines or scan a barcode" value={searchQuery} onChangeText={handleSearchChange} trailing={<WorkspaceIconButton icon="barcode-outline" label="Scan medicine barcode" onPress={() => router.push('/(app)/scanner' as any)} />} />
      </WorkspaceHeader>

      {/* Category Chips (Only if not searching) */}
      {!isSearchActive && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {CATEGORIES.map(cat => <WorkspaceChip key={cat} label={cat} selected={selectedCategory === cat} onPress={() => setSelectedCategory(cat)} />)}
          </ScrollView>
        </View>
      )}

      <View style={{ flex: 1, flexDirection: layout.wide ? 'row' : 'column', minHeight: 0 }}>
      {/* Product Grid */}
      <View style={styles.gridContainer}>
        {isLoading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlashList
            key={numColumns}
            data={listData}
            numColumns={numColumns}
            overrideItemLayout={productSpan}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            getItemType={listItemType}
            keyExtractor={listItemKey}
            contentContainerStyle={gridPadding}
            renderItem={renderItem}
          />
        )}
      </View>

      {layout.wide && (
        <View style={{ width: salePanelWidth, borderLeftWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, paddingBottom: layout.scrollBottom }}>
          <Text style={{ padding: 16, minHeight: 60, color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, fontSize: 18 }}>Current Sale</Text>
          {cartContent}
        </View>
      )}
      </View>
      {/* Cart Bottom Sheet */}
      {!layout.wide && (
        <BottomSheet ref={cartSheetRef} snapPoints={['60%', '92%']} title="Current Sale">
          {cartContent}
        </BottomSheet>
      )}

      <UpiPaymentSheet
        state={upiModal}
        shopName={shopName}
        upiId={upiId}
        amount={pendingUpiAmount}
        qrValue={upiQrValue}
        isConfirming={createSaleMutation.isPending}
        onClose={closeUpiModal}
        onConfirmPayment={executeSale}
      />
    </View>
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24 },
  cartIconWrapper: { position: 'relative', minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  cartBadge: { position: 'absolute', top: 0, right: 0, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  cartBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', minHeight: 52, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },
  categoryScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  categoryChip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 22 },
  categoryText: { fontSize: 14 },
  gridContainer: { flex: 1 },
  flashListContent: { padding: 8, paddingBottom: 100 },
  substituteHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, width: '100%' },
  substituteHeaderText: { fontSize: 16 },
  cartSheetHeader: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cartItemRow: { flexDirection: 'row', padding: 16, borderBottomWidth: 0.5, alignItems: 'center' },
  cartItemInitials: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cartItemDetails: { flex: 1 },
  cartStepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 4 },
  cartStepperBtnHoriz: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  deleteAction: { width: 80, justifyContent: 'center', alignItems: 'center' },
  cartSummary: { padding: 16, borderTopWidth: 0.5 },
  paymentRow: { flexWrap: 'wrap', flexDirection: 'row', gap: 8, marginBottom: 16 },
  paymentPill: { minWidth: 64, flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  totalsBox: { marginBottom: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  checkoutBtn: { minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  checkoutBtnText: { color: '#fff', fontSize: 13 },
});
