import React, { useState, useRef, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useWindowDimensions,
  TextInput,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { Swipeable } from 'react-native-gesture-handler';

import { useTheme } from '@/hooks/useTheme';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useMedicines, useSearchMedicines } from '@/hooks/useInventory';
import { useCreateSale } from '@/hooks/useSales';
import { useCartStore, PaymentMode, type CartItem } from '@/stores/cartStore';
import { formatCurrency } from '@/utils/format';
import type { Medicine } from '@/api/inventory';
import type { CreateSaleBody } from '@/api/sales';

/* ─── Types and Constants ─── */

const CATEGORIES = ['All', 'Tablet', 'Syrup', 'Injection', 'Capsule', 'Cream', 'Drops', 'Other'];

type ListItem =
  | { type: 'product'; item: Medicine }
  | { type: 'substitute'; item: Medicine }
  | { type: 'header'; title: string };

/**
 * Mirrors Medical POS Backend `src/routes/sales.ts` POST handler (subtotal, gst_amount, net_amount).
 * Used so `paid_amount` matches server-side `net_amount` for immediate payment modes.
 */
function computeSaleTotalsForApi(items: CartItem[], billDiscountPct: number): {
  discount: number;
  net_amount: number;
} {
  let subtotal = 0;
  let gst_amount = 0;
  for (const item of items) {
    const dp = item.discountPct ?? 0;
    subtotal += item.qty * item.mrp * (1 - dp / 100);
    gst_amount += (item.qty * item.mrp * (item.gstRate ?? 0)) / 100;
  }
  const discount = subtotal * (billDiscountPct / 100);
  const net_amount = subtotal - discount + gst_amount;
  return { discount, net_amount };
}

/* ─── Main Component ─── */

export default function PosScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const numColumns = width > 600 ? 3 : 2;

  // Local State
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [isSubstitutesExpanded, setIsSubstitutesExpanded] = useState(true);

  // Refs
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const cartSheetRef = useRef<any>(null);

  // Stores & Mutations
  const cartStore = useCartStore();
  const createSaleMutation = useCreateSale();

  // Queries
  const isSearchActive = debouncedQuery.length >= 2;
  const { data: allMedicinesData, isLoading: isLoadingAll } = useMedicines(
    !isSearchActive ? { category: selectedCategory === 'All' ? undefined : selectedCategory } : undefined
  );
  const { data: searchData, isLoading: isLoadingSearch } = useSearchMedicines(
    isSearchActive ? debouncedQuery : ''
  );

  const isLoading = isSearchActive ? isLoadingSearch : isLoadingAll;

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
    const defaultBatch = product.medicine_batches?.[0];
    if (!defaultBatch || (product.total_stock ?? 0) === 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    cartStore.addItem({
      product,
      batchId: defaultBatch.id,
      qty: 1,
      mrp: defaultBatch.mrp,
      discountPct: 0,
      gstRate: product.gstRate,
    });
  }, [cartStore]);

  const handleUpdateQty = useCallback((batchId: string, increment: number, currentQty: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newQty = currentQty + increment;
    if (newQty <= 0) {
      cartStore.removeItem(batchId);
    } else {
      cartStore.updateQty(batchId, newQty);
    }
  }, [cartStore]);

  const cartItemCount = cartStore.getItemCount();

  // Checkout Handler
  const handleCheckout = useCallback(() => {
    if (cartStore.paymentMode === 'credit' && !cartStore.customerId) {
       Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
       // We would ideally show a toast here, but relying on visual cues or a future toast integration
       return;
    }

    const { discount, net_amount } = computeSaleTotalsForApi(cartStore.items, cartStore.discountPct);
    const mode = cartStore.paymentMode;

    let paid_amount: number;
    let payment_status: CreateSaleBody['payment_status'];
    if (mode === 'credit') {
      paid_amount = 0;
      payment_status = 'credit';
    } else {
      paid_amount = net_amount;
      payment_status = 'paid';
    }

    const payload: CreateSaleBody = {
      ...(cartStore.customerId ? { customer_id: cartStore.customerId } : {}),
      discount,
      payment_mode: mode,
      payment_status,
      paid_amount,
      items: cartStore.items.map((i) => ({
        medicine_id: i.product.id,
        batch_id: i.batchId,
        quantity: i.qty,
        mrp: i.mrp,
        discount_pct: i.discountPct ?? 0,
        gst_rate: i.gstRate ?? 0,
      })),
    };

    createSaleMutation.mutate(payload, {
      onSuccess: (data) => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        cartStore.clearCart();
        cartSheetRef.current?.close();
        router.push({ pathname: '/(app)/sale-success', params: { id: data.id } });
      },
    });
  }, [cartStore, createSaleMutation]);

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

    const product = item.item;
    const isOutOfStock = (product.total_stock ?? 0) === 0;
    const isLowStock = !isOutOfStock && (product.total_stock ?? 0) <= 10;
    const batch = product.medicine_batches?.[0]; // Fallback to first batch
    const price = batch?.mrp ?? 0;
    
    // Check if in cart to show stepper instead
    const cartItem = cartStore.items.find(i => i.product.id === product.id);

    return (
      <View style={{ flex: 1 / numColumns, padding: 6 }}>
        <View style={[styles.productCard, { 
            backgroundColor: theme.colors.surface, 
            borderColor: item.type === 'substitute' ? theme.colors.accent : theme.colors.border,
            borderLeftWidth: item.type === 'substitute' ? 3 : 0.5,
            ...theme.shadow.card 
          }]}
        >
          {/* Icon Area */}
          <View style={[styles.iconArea, { backgroundColor: theme.colors.primaryLight }]}>
            <Ionicons name="medical" size={28} color={theme.colors.primary} style={{ opacity: 0.6 }} />
            {product.barcode && (
              <View style={[styles.barcodeBadge, { backgroundColor: theme.colors.surface }]}>
                <Ionicons name="barcode-outline" size={12} color={theme.colors.text.primary} />
              </View>
            )}
          </View>

          {/* Details */}
          <Text style={[styles.productName, { color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }]} numberOfLines={2}>
            {product.name}
          </Text>
          <Text style={[styles.productGeneric, { color: theme.colors.text.secondary, fontFamily: theme.typography.family.regular }]} numberOfLines={1}>
            {product.genericName || 'No generic'}
          </Text>

          {/* Price & Stock */}
          <View style={styles.priceRow}>
            <Text style={[styles.productPrice, { color: theme.colors.primary, fontFamily: theme.typography.family.bold }]}>
              {formatCurrency(price)}
            </Text>
            <View style={[
              styles.stockBadge, 
              { backgroundColor: isOutOfStock ? theme.colors.border : isLowStock ? theme.colors.dangerLight : theme.colors.successLight }
            ]}>
              <Text style={[styles.stockBadgeText, { color: isOutOfStock ? theme.colors.text.secondary : isLowStock ? theme.colors.danger : theme.colors.success, fontFamily: theme.typography.family.medium }]}>
                {isOutOfStock ? 'Out' : isLowStock ? 'Low' : product.total_stock}
              </Text>
            </View>
          </View>

          {/* Add / Stepper Button */}
          {cartItem ? (
            <View style={[styles.stepperContainer, { backgroundColor: theme.colors.primary }]}>
                <TouchableOpacity onPress={() => handleUpdateQty(cartItem.batchId, -1, cartItem.qty)} style={styles.stepperBtn}>
                    <Ionicons name="remove" size={16} color="#fff" />
                </TouchableOpacity>
                <Text style={[styles.stepperValue, { fontFamily: theme.typography.family.medium }]}>{cartItem.qty}</Text>
                <TouchableOpacity onPress={() => handleUpdateQty(cartItem.batchId, 1, cartItem.qty)} style={styles.stepperBtn}>
                    <Ionicons name="add" size={16} color="#fff" />
                </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity 
              style={[styles.addButton, { backgroundColor: isOutOfStock ? theme.colors.border : theme.colors.primary, opacity: isOutOfStock ? 0.5 : 1 }]}
              onPress={() => handleAddToCart(product)}
              disabled={isOutOfStock}
            >
              <Ionicons name="add" size={18} color={isOutOfStock ? theme.colors.text.secondary : "#FFFFFF"} />
            </TouchableOpacity>
          )}

          {/* Out of stock overlay */}
          {isOutOfStock && (
            <View style={styles.outOfStockOverlay}>
              <Text style={styles.outOfStockText}>Out of Stock</Text>
            </View>
          )}
        </View>
      </View>
    );
  }, [theme, cartStore, isSubstitutesExpanded, numColumns, handleAddToCart, handleUpdateQty]);

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <GlassMeshBackground />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <View style={styles.headerTopRow}>
          <Text style={[styles.title, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>Point of Sale</Text>
          <TouchableOpacity onPress={() => cartSheetRef.current?.expand()} style={styles.cartIconWrapper}>
            <Ionicons name="cart-outline" size={28} color={theme.colors.text.primary} />
            {cartItemCount > 0 && (
              <View style={[styles.cartBadge, { backgroundColor: theme.colors.danger }]}>
                <Text style={styles.cartBadgeText}>{cartItemCount}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        <View style={[styles.searchContainer, { backgroundColor: theme.colors.background }]}>
          <Ionicons name="search" size={20} color={theme.colors.text.secondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text.primary, fontFamily: theme.typography.family.regular }]}
            placeholder="Search medicines, scan barcode..."
            placeholderTextColor={theme.colors.text.secondary}
            value={searchQuery}
            onChangeText={handleSearchChange}
          />
          <TouchableOpacity onPress={() => router.push('/(app)/scanner' as any)}>
            <Ionicons name="barcode-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Category Chips (Only if not searching) */}
      {!isSearchActive && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryScroll}>
            {CATEGORIES.map(cat => (
              <TouchableOpacity
                key={cat}
                style={[
                  styles.categoryChip,
                  { backgroundColor: selectedCategory === cat ? theme.colors.primary : theme.colors.surface }
                ]}
                onPress={() => setSelectedCategory(cat)}
              >
                <Text style={[
                  styles.categoryText,
                  { color: selectedCategory === cat ? '#fff' : theme.colors.text.secondary, fontFamily: theme.typography.family.medium }
                ]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Product Grid */}
      <View style={styles.gridContainer}>
        {isLoading ? (
          <ActivityIndicator color={theme.colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <FlashListAny
            data={listData}
            numColumns={numColumns}
            estimatedItemSize={180}
            getItemType={(item: ListItem) => item.type}
            keyExtractor={(item: ListItem, index: number) => item.type === 'header' ? 'header' : item.type + '_' + item.item.id}
            contentContainerStyle={styles.flashListContent}
            renderItem={renderItem}
          />
        )}
      </View>

      {/* Cart Bottom Sheet */}
      <BottomSheet ref={cartSheetRef} snapPoints={['60%', '92%']} title="Current Sale">
         <View style={styles.cartSheetHeader}>
           <TouchableOpacity onPress={() => cartStore.clearCart()}>
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
              <FlashListAny
                data={cartStore.items}
                keyExtractor={(item: any) => item.batchId}
                estimatedItemSize={72}
                renderItem={({ item }: { item: typeof cartStore.items[0] }) => (
                  <Swipeable
                    renderRightActions={() => (
                      <TouchableOpacity style={[styles.deleteAction, { backgroundColor: theme.colors.danger }]} onPress={() => cartStore.removeItem(item.batchId)}>
                         <Ionicons name="trash-outline" size={24} color="#fff" />
                      </TouchableOpacity>
                    )}
                  >
                    <View style={[styles.cartItemRow, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
                      <View style={[styles.cartItemInitials, { backgroundColor: theme.colors.primaryLight }]}>
                        <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold }}>{item.product.name.charAt(0)}</Text>
                      </View>
                      <View style={styles.cartItemDetails}>
                        <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{item.product.name}</Text>
                        <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.regular, fontSize: 12 }}>
                          {formatCurrency(item.mrp)} / unit
                        </Text>
                      </View>
                      <View style={[styles.cartStepper, { borderColor: theme.colors.border }]}>
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
                       <Text style={{ color: cartStore.paymentMode === mode ? '#fff' : theme.colors.text.secondary, fontFamily: theme.typography.family.medium, textTransform: 'capitalize' }}>{mode}</Text>
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
                     <ActivityIndicator color="#fff" />
                   ) : (
                     <Text style={[styles.checkoutBtnText, { fontFamily: theme.typography.family.semiBold }]}>Proceed to Checkout</Text>
                   )}
                 </TouchableOpacity>
              </View>
           </View>
         )}
      </BottomSheet>
    </View>
  );
}

/* ─── Styles ─── */

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5 },
  headerTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24 },
  cartIconWrapper: { position: 'relative', padding: 4 },
  cartBadge: { position: 'absolute', top: 0, right: 0, borderRadius: 10, minWidth: 20, height: 20, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  cartBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  searchContainer: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, paddingHorizontal: 12 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 15 },
  categoryScroll: { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  categoryChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  categoryText: { fontSize: 14 },
  gridContainer: { flex: 1 },
  flashListContent: { padding: 8, paddingBottom: 100 },
  productCard: { borderRadius: 16, padding: 12, margin: 6, position: 'relative' },
  iconArea: { height: 80, borderRadius: 12, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  barcodeBadge: { position: 'absolute', top: 6, right: 6, padding: 4, borderRadius: 8 },
  productName: { fontSize: 14, marginTop: 8, minHeight: 40 },
  productGeneric: { fontSize: 12, marginTop: 2, marginBottom: 8 },
  priceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 'auto' },
  productPrice: { fontSize: 16 },
  stockBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  stockBadgeText: { fontSize: 10 },
  addButton: { position: 'absolute', bottom: 12, right: 12, width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  stepperContainer: { position: 'absolute', bottom: 12, right: 12, height: 32, borderRadius: 16, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, transform: [{ scale: 0.95 }] },
  stepperBtn: { padding: 4 },
  stepperValue: { color: '#fff', marginHorizontal: 8, fontSize: 14 },
  outOfStockOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)', borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
  outOfStockText: { color: '#fff', fontWeight: 'bold' },
  substituteHeader: { flexDirection: 'row', justifyContent: 'space-between', padding: 16, width: '100%' },
  substituteHeaderText: { fontSize: 16 },
  cartSheetHeader: { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  emptyCart: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cartItemRow: { flexDirection: 'row', padding: 16, borderBottomWidth: 0.5, alignItems: 'center' },
  cartItemInitials: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  cartItemDetails: { flex: 1 },
  cartStepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, padding: 4 },
  cartStepperBtnHoriz: { padding: 4 },
  deleteAction: { width: 80, justifyContent: 'center', alignItems: 'center' },
  cartSummary: { padding: 16, borderTopWidth: 0.5 },
  paymentRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  paymentPill: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  totalsBox: { marginBottom: 16 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  checkoutBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  checkoutBtnText: { color: '#fff', fontSize: 17 },
});
