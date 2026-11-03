import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceFab, WorkspaceEmpty } from '@/components/ui/Workspace';
import { mobileLayout } from '@/theme/mobileLayout';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { LiquidSheen } from '@/components/glass/LiquidGlass';
import { useMemo } from 'react';
import { useWindowDimensions, View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { usePurchases } from '@/hooks/usePurchases';
import { formatCurrency, formatDate } from '@/utils/format';
import type { Purchase } from '@/api/purchases';

export default function PurchasesIndexScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);

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
        style={[styles.card, { backgroundColor: theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]}
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          router.push(`/(app)/purchases/${item.id}`);
        }}
      >
        <LiquidSheen dark={isDark} />
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
      <GlassMeshBackground />
       <WorkspaceHeader title="Purchases" icon="bag-handle-outline" subtitle="Supplier invoices and payments" onBack={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')} />

       <View style={styles.listContainer}>
          {isLoading && !data ? (
            <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
          ) : (
            <FlashListAny
              key={layout.listColumns}
              numColumns={layout.listColumns}
              data={purchases}
              keyExtractor={(item: Purchase) => item.id}
              estimatedItemSize={90}
              renderItem={renderPurchase}
              contentContainerStyle={{ paddingTop: 12, paddingHorizontal: 6, paddingBottom: insets.bottom + 88 }}
              onEndReached={() => {
                if (hasNextPage && !isFetchingNextPage) {
                  fetchNextPage();
                }
              }}
              onEndReachedThreshold={0.5}
              ListEmptyComponent={<WorkspaceEmpty title="No purchases yet" description="Received supplier invoices will appear here." icon="bag-handle-outline" />}
              ListFooterComponent={
                isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={theme.colors.primary} /> : null
              }
            />
          )}
       </View>

       <WorkspaceFab label="Record purchase" onPress={() => router.push('/(app)/purchases/add')} bottom={insets.bottom + 20} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 16, borderBottomWidth: 0.5 },
  backBtn: { marginRight: 16 },
  headerTitle: { flex: 1, fontSize: 24 },
  listContainer: { flex: 1 },
  card: { borderWidth: 1, borderRadius: 16, padding: 14, marginHorizontal: 6, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  statusBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  cardBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }
});
