import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Animated, ScrollView, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { shortbookApi, ShortbookItem } from '@/api/shortbook';
import { inventoryApi } from '@/api/inventory';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useUIStore } from '@/stores/uiStore';

// standard formatRelative wrapper if util is strictly unmapped
function formatRel(dateStr: string) {
  const diffHours = (new Date().getTime() - new Date(dateStr).getTime()) / 3600000;
  if (diffHours < 24) return Math.floor(diffHours) === 0 ? 'Just now' : `${Math.floor(diffHours)} hours ago`;
  return `${Math.floor(diffHours/24)} days ago`;
}

export default function ShortbookIndexScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const addToast = useUIStore(s => s.addToast);
  const qc = useQueryClient();

  const { data: shortbook, isLoading } = useQuery({
    queryKey: ['shortbook'],
    queryFn: () => shortbookApi.getShortbook()
  });

  const markOrderedMutation = useMutation({
    mutationFn: (id: string) => shortbookApi.markOrdered(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortbook'] });
      addToast('Marked as ordered', 'success');
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => shortbookApi.removeFromShortbook(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortbook'] });
      addToast('Removed from shortbook', 'success');
    }
  });

  // Simplified Add Medicine state
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const [medName, setMedName] = useState('');
  const [reqQty, setReqQty] = useState('10');

  const addMutation = useMutation({
    mutationFn: async ({ query, quantity }: { query: string; quantity: number }) => {
      const result = await inventoryApi.searchMedicines(query.trim());
      const med = result.results?.[0] ?? result.substitutes?.[0];
      if (!med?.id) {
        throw new Error('NO_MEDICINE_MATCH');
      }
      return shortbookApi.addToShortbook({
        medicine_id: med.id,
        reason: 'manual',
        ...(quantity > 0 ? { quantity_needed: quantity } : {}),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shortbook'] });
      qc.invalidateQueries({ queryKey: ['low-stock'] });
      addToast('Item added to shortbook', 'success');
      sheetRef.current?.collapse();
      setMedName('');
      setReqQty('10');
    },
    onError: (err: Error) => {
      if (err.message === 'NO_MEDICINE_MATCH') {
        addToast('No medicine found — pick a name that matches inventory search', 'error');
      } else {
        addToast('Failed to add to shortbook', 'error');
      }
    },
  });

  const submitAdd = () => {
    if (!medName.trim()) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const quantity = parseInt(reqQty, 10);
    addMutation.mutate({
      query: medName,
      quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 0,
    });
  };

  const renderRightActions = (prog: any, dragX: any, id: string) => {
    const scale = dragX.interpolate({ inputRange: [-80, 0], outputRange: [1, 0], extrapolate: 'clamp' });
    return (
      <TouchableOpacity 
        style={[styles.swipeAction, { backgroundColor: theme.colors.danger }]} 
        onPress={() => {
           Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
           deleteMutation.mutate(id);
        }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="trash" size={24} color="#FFF" />
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderItem = ({ item }: { item: ShortbookItem }) => (
    <Swipeable renderRightActions={(p, d) => renderRightActions(p, d, item.id)} friction={2}>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
        <View style={{ flex: 1, paddingRight: 16 }}>
           <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 16, color: theme.colors.text.primary, marginBottom: 2 }}>{item.medicineName}</Text>
           <Text style={{ fontSize: 13, color: theme.colors.text.secondary }}>{item.genericName}</Text>
           <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}>
             <View style={[styles.stockBadge, { backgroundColor: theme.colors.dangerLight }]}>
               <Text style={{ color: theme.colors.danger, fontSize: 11, fontFamily: theme.typography.family.bold }}>Out of Stock</Text>
             </View>
             <Text style={{ fontSize: 11, color: theme.colors.text.tertiary, marginLeft: 8 }}>Added {formatRel(item.addedAt)}</Text>
           </View>
        </View>
        
        {item.isOrdered ? (
          <View style={[styles.orderedBadge, { backgroundColor: theme.colors.successLight }]}>
            <Ionicons name="checkmark-circle" size={14} color={theme.colors.success} style={{ marginRight: 4 }} />
            <Text style={{ color: theme.colors.success, fontSize: 12, fontFamily: theme.typography.family.bold }}>Ordered</Text>
          </View>
        ) : (
          <TouchableOpacity 
             style={[styles.markBtn, { borderColor: theme.colors.primary }]}
             onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                markOrderedMutation.mutate(item.id);
             }}
          >
            <Text style={{ color: theme.colors.primary, fontSize: 12, fontFamily: theme.typography.family.semiBold }}>Mark Ordered</Text>
          </TouchableOpacity>
        )}
      </View>
    </Swipeable>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
           <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }} hitSlop={10}>
             <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
           </TouchableOpacity>
           <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 28, fontFamily: theme.typography.family.bold, color: theme.colors.text.primary }}>Shortbook</Text>
                {shortbook && <View style={[styles.countBadge, { backgroundColor: theme.colors.primary }]}><Text style={{ color: '#FFF', fontSize: 12, fontFamily: theme.typography.family.bold }}>{shortbook.length}</Text></View>}
              </View>
              <Text style={{ fontSize: 13, color: theme.colors.text.secondary }}>Medicines pending order</Text>
           </View>
        </View>

        <View style={{ flex: 1 }}>
          {isLoading ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
          ) : (
            <FlashListAny
              data={shortbook || []}
              keyExtractor={(i: ShortbookItem) => i.id}
              estimatedItemSize={90}
              contentContainerStyle={{ paddingVertical: 12 }}
              renderItem={renderItem}
              ListEmptyComponent={
                <View style={{ alignItems: 'center', justifyContent: 'center', marginTop: '20%', paddingHorizontal: 32 }}>
                   <View style={[styles.emptyCircle, { backgroundColor: theme.colors.primaryLight }]}>
                     <Ionicons name="clipboard-outline" size={48} color={theme.colors.primary} />
                   </View>
                   <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 20, color: theme.colors.text.primary, marginTop: 24 }}>All stocked up!</Text>
                   <Text style={{ color: theme.colors.text.secondary, textAlign: 'center', marginTop: 8, lineHeight: 20 }}>No items in shortbook. Add from inventory when stock runs low directly.</Text>
                </View>
              }
            />
          )}
        </View>

        <TouchableOpacity 
           style={[styles.fab, { backgroundColor: theme.colors.primary, ...theme.shadow.card }]}
           onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); sheetRef.current?.expand(); }}
        >
           <Ionicons name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>

        <BottomSheet ref={sheetRef} snapPoints={['40%']} title="Add to Shortbook">
           <View style={{ padding: 24 }}>
              <TextInput
                 style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text.primary }]}
                 placeholder="Search medicine name..."
                 placeholderTextColor={theme.colors.text.tertiary}
                 value={medName}
                 onChangeText={setMedName}
                 autoFocus={true}
              />
              <TextInput
                 style={[styles.input, { borderColor: theme.colors.border, color: theme.colors.text.primary, marginTop: 12 }]}
                 placeholder="Suggested Order Qty (Default 10)"
                 placeholderTextColor={theme.colors.text.tertiary}
                 value={reqQty}
                 onChangeText={setReqQty}
                 keyboardType="numeric"
              />
              <TouchableOpacity 
                style={[styles.submitBtn, { backgroundColor: theme.colors.primary, marginTop: 24, opacity: !medName.trim() ? 0.6 : 1 }]}
                disabled={!medName.trim() || addMutation.isPending}
                onPress={submitAdd}
              >
                {addMutation.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Queue Order</Text>}
              </TouchableOpacity>
           </View>
        </BottomSheet>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  countBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12, marginLeft: 8 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 10 },
  stockBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  orderedBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 },
  markBtn: { height: 32, width: 95, borderRadius: 16, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  swipeAction: { justifyContent: 'center', alignItems: 'flex-end', width: 80, borderRadius: 12, marginBottom: 10, marginRight: 16, paddingHorizontal: 20 },
  emptyCircle: { width: 100, height: 100, borderRadius: 50, justifyContent: 'center', alignItems: 'center' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' },
  input: { height: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, fontSize: 16 },
  submitBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
