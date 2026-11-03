import { AppText as Text } from '@/components/ui/AppText';
import React, { memo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { LiquidPanel } from '@/components/glass/LiquidGlass';
import { useTheme } from '@/hooks/useTheme';
import { formatCurrency } from '@/utils/format';
import { pickSellableBatch } from '@/utils/batchSelection';
import type { Medicine } from '@/api/inventory';
import type { CartItem } from '@/stores/cartStore';

/** Recycled cards only update when their product, cart line, or appearance changes. */
export const ProductCard = memo(function ProductCard({ product, substitute, cartItem, onAdd, onQuantity }: {
  product: Medicine;
  substitute: boolean;
  cartItem?: CartItem;
  onAdd: (product: Medicine) => void;
  onQuantity: (batchId: string, increment: number, currentQty: number) => void;
}) {
  const { theme, isDark } = useTheme();
  const c = theme.colors;
  const batch = pickSellableBatch(product.medicine_batches);
  const unavailable = !batch || batch.quantity <= 0;
  const stock = product.total_stock ?? 0;
  const stockColour = unavailable ? c.text.secondary : stock <= 10 ? c.warning : c.primary;
  return (
    <View style={s.cell}>
      <LiquidPanel dark={isDark} tone={substitute ? 'violet' : undefined} style={[s.card, { borderColor: substitute ? c.accent : c.border }]}>
        <View style={s.top}>
          <View style={[s.icon, { backgroundColor: substitute ? c.accentLight : c.primaryLight }]}>
            <Ionicons name="medical-outline" size={23} color={substitute ? c.accent : c.primary} />
            {product.barcode && <View style={[s.barcode, { backgroundColor: c.surface }]}><Ionicons name="barcode-outline" size={12} color={c.text.secondary} /></View>}
          </View>
          <Text style={[s.stock, { color: stockColour }]}>{unavailable ? 'Out of stock' : `${stock} in stock`}</Text>
        </View>
        <Text numberOfLines={2} style={[s.name, { color: c.text.primary, fontFamily: theme.typography.family.semiBold }]}>{product.name}</Text>
        <Text numberOfLines={1} style={[s.generic, { color: c.text.secondary }]}>{product.genericName || 'No generic'}</Text>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[s.price, { color: c.text.primary, fontFamily: theme.typography.family.bold }]}>{formatCurrency(cartItem?.mrp ?? batch?.mrp ?? product.medicine_batches?.[0]?.mrp ?? 0)}</Text>
        {cartItem ? (
          <View style={[s.stepper, { backgroundColor: c.primaryLight }]}>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove one ${product.name}`} onPress={() => onQuantity(cartItem.batchId, -1, cartItem.qty)} style={s.step}>
              <Ionicons name="remove" size={20} color={c.primary} />
            </Pressable>
            <Text style={{ color: c.primary, fontSize: 15, fontFamily: theme.typography.family.semiBold }}>{cartItem.qty}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Add one ${product.name}`} accessibilityState={{ disabled: cartItem.qty >= cartItem.maxQty }} disabled={cartItem.qty >= cartItem.maxQty} onPress={() => onQuantity(cartItem.batchId, 1, cartItem.qty)} style={[s.step, cartItem.qty >= cartItem.maxQty && { opacity: 0.4 }]}>
              <Ionicons name="add" size={20} color={c.primary} />
            </Pressable>
          </View>
        ) : (
          <Pressable accessibilityRole="button" accessibilityLabel={`Add ${product.name} to cart`} accessibilityState={{ disabled: unavailable }} disabled={unavailable} onPress={() => onAdd(product)} style={({ pressed }) => [s.add, { backgroundColor: unavailable ? c.primaryLight : c.primary, opacity: pressed ? 0.8 : 1 }]}>
            <Ionicons name="add" size={18} color={unavailable ? c.text.secondary : c.text.inverse} />
            <Text style={{ color: unavailable ? c.text.secondary : c.text.inverse, fontSize: 13, fontFamily: theme.typography.family.semiBold }}>{unavailable ? 'Unavailable' : 'Add to cart'}</Text>
          </Pressable>
        )}
      </LiquidPanel>
    </View>
  );
});

const s = StyleSheet.create({
  cell: { flex: 1, padding: 5 },
  card: { padding: 14, borderRadius: 16, borderWidth: 1 },
  top: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 14 },
  icon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  barcode: { position: 'absolute', right: -3, bottom: -3, width: 19, height: 19, borderRadius: 7, alignItems: 'center', justifyContent: 'center' },
  stock: { flex: 1, fontSize: 11, textAlign: 'right' },
  name: { fontSize: 14, minHeight: 42, lineHeight: 21 },
  generic: { fontSize: 12, marginTop: 3 },
  price: { fontSize: 20, marginTop: 14, marginBottom: 14, fontVariant: ['tabular-nums'] },
  add: { minHeight: 46, paddingVertical: 10, borderRadius: 12, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  stepper: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8 },
  step: { minWidth: 44, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
});
