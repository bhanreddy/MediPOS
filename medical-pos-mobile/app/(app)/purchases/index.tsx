import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { usePurchases } from '@/hooks/usePurchases';
import { formatCurrency, formatDate } from '@/utils/format';
import type { Purchase } from '@/api/purchases';

export default function PurchasesIndexScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = usePurchases({ limit: 20 });

  const purchases = useMemo(() => data?.pages.flatMap(p => p.data) || [], [data]);

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'paid': return theme.colors.success;
      case 'partial': return theme.colors.warning;
      case 'unpaid': return theme.colors.danger;
      default: return theme.colors.primary;
    }
  };

  const renderPurchase = ({ item }: { item: Purchase }) => {
    const statusColor = getStatusColor(item.paymentStatus);

    return (
      <TouchableOpacity 
        style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(app)/purchases/${item.id}`);
        }}
      >
        <View style={styles.cardHeader}>
           <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 15, color: theme.colors.text.primary }}>
             {item.supplierName || 'Direct Purchase'}
           </Text>
           <View style={[styles.statusBadge, { backgroundColor: statusColor + '20' }]}>
             <Text style={{ color: statusColor, fontSize: 10, fontFamily: theme.typography.family.bold }}>
               {item.paymentStatus || 'Unpaid'}
             </Text>
           </View>
        </View>

        <View style={styles.cardBody}>
           <View>
             <Text style={{ color: theme.colors.text.secondary, fontSize: 13, marginBottom: 2 }}>
               Inv: {item.billNumber}
             </Text>
             <Text style={{ color: theme.colors.text.tertiary, fontSize: 12 }}>
               {formatDate(item.createdAt)}
             </Text>
           </View>

           <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 16, color: theme.colors.primary }}>
             {formatCurrency(item.grandTotal)}
           </Text>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
       <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>Purchases</Text>
       </View>

       <View style={styles.listContainer}>
          {isLoading && !data ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
          ) : (
            <FlashListAny
              data={purchases}
              keyExtractor={(item: Purchase) => item.id}
              estimatedItemSize={90}
              renderItem={renderPurchase}
              contentContainerStyle={{ paddingVertical: 16 }}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={<Text style={{ textAlign: 'center', marginTop: 40, color: theme.colors.text.tertiary }}>No purchases found.</Text>}
              ListFooterComponent={
                isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={theme.colors.primary} /> : null
              }
            />
          )}
       </View>

       <TouchableOpacity 
         style={[styles.fab, { backgroundColor: theme.colors.primary, ...theme.shadow.card }]}
         onPress={() => router.push('/(app)/purchases/add')}
       >
         <Ionicons name="add" size={28} color="#FFFFFF" />
       </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 16, borderBottomWidth: 0.5 },
  backBtn: { marginRight: 16 },
  headerTitle: { flex: 1, fontSize: 24 },
  listContainer: { flex: 1 },
  card: { borderRadius: 12, padding: 16, marginHorizontal: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }
});
