import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useLocalSearchParams, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { useMedicine, useMedicineBatches, useAddToShortbook } from '@/hooks/useInventory';
import { formatCurrency, formatDate } from '@/utils/format';
import type { MedicineBatch } from '@/api/inventory';

export default function InventoryDetailScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();

  const { data: medicine, isLoading: isLoadingMed } = useMedicine(id as string);
  const { data: batches, isLoading: isLoadingBatches } = useMedicineBatches(id as string);
  const addToShortbook = useAddToShortbook();

  const handleEdit = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push({ pathname: '/(app)/inventory/add', params: { editId: id } });
  };

  const handleShortbook = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    addToShortbook.mutate(id as string);
  };

  if (isLoadingMed) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (!medicine) {
    return (
      <View style={[styles.loadingCenter, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.text.secondary }}>Medicine not found.</Text>
      </View>
    );
  }

  const renderBatch = ({ item }: { item: MedicineBatch }) => {
    const days = Math.floor((new Date(item.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    let statusColor = theme.colors.success;
    if (days < 30) statusColor = theme.colors.danger;
    else if (days < 90) statusColor = theme.colors.warning;

    return (
      <View style={[styles.batchRow, { backgroundColor: theme.colors.surface, borderLeftColor: statusColor, ...theme.shadow.card }]}>
        <View style={styles.batchTop}>
          <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }}>Batch {item.batchNumber}</Text>
          <Text style={{ color: statusColor, fontFamily: theme.typography.family.medium, fontSize: 12 }}>
            {days < 0 ? 'Expired' : `Expires in ${days} days`}
          </Text>
        </View>
        <View style={styles.batchMid}>
           <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>Qty: {item.quantity}</Text>
           <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>{formatDate(item.expiryDate)}</Text>
        </View>
        <View style={styles.batchBot}>
           <Text style={{ color: theme.colors.text.tertiary, fontSize: 12 }}>Purchase: {formatCurrency(item.purchasePrice)}</Text>
           <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.semiBold }}>MRP: {formatCurrency(item.mrp)}</Text>
        </View>
      </View>
    );
  };

  const isLowStock = medicine.totalStock <= medicine.reorderLevel;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface, paddingTop: insets.top + 16, borderBottomColor: theme.colors.border }]}>
         <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
           <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
         </TouchableOpacity>
         <Text style={[styles.headerTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]} numberOfLines={1}>
           {medicine.name}
         </Text>
         <TouchableOpacity onPress={handleEdit} style={styles.editBtn} hitSlop={10}>
           <Ionicons name="pencil" size={20} color={theme.colors.primary} />
         </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
         {/* Medicine Info Card */}
         <View style={[styles.infoCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
            {medicine.schedule === 'H1' && (
              <View style={[styles.h1Badge, { backgroundColor: theme.colors.danger }]}>
                <Text style={styles.h1Text}>Schedule H1</Text>
              </View>
            )}
            <Text style={[styles.medName, { color: theme.colors.primary, fontFamily: theme.typography.family.bold }]}>{medicine.name}</Text>
            <Text style={[styles.medGeneric, { color: theme.colors.text.secondary, fontFamily: theme.typography.family.regular }]}>{medicine.genericName}</Text>
            
            <View style={styles.infoGrid}>
               <View style={styles.infoCol}>
                 <Text style={[styles.infoLabel, { color: theme.colors.text.tertiary }]}>Manufacturer</Text>
                 <Text style={[styles.infoValue, { color: theme.colors.text.primary }]}>{medicine.manufacturer}</Text>
               </View>
               <View style={styles.infoCol}>
                 <Text style={[styles.infoLabel, { color: theme.colors.text.tertiary }]}>Category</Text>
                 <Text style={[styles.infoValue, { color: theme.colors.text.primary }]}>{medicine.category}</Text>
               </View>
               <View style={styles.infoCol}>
                 <Text style={[styles.infoLabel, { color: theme.colors.text.tertiary }]}>GST Rate</Text>
                 <Text style={[styles.infoValue, { color: theme.colors.text.primary }]}>{medicine.gstRate}%</Text>
               </View>
            </View>
         </View>

         {/* Stock Overview */}
         <View style={styles.stockOverview}>
            <View style={[styles.metricTile, { backgroundColor: isLowStock ? theme.colors.dangerLight : theme.colors.successLight }]}>
              <Text style={[styles.metricLabel, { color: theme.colors.text.secondary }]}>Total Stock</Text>
              <Text style={[styles.metricValue, { color: isLowStock ? theme.colors.danger : theme.colors.success }]}>{medicine.totalStock}</Text>
            </View>
            <View style={[styles.metricTile, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.metricLabel, { color: theme.colors.text.secondary }]}>Batches</Text>
              <Text style={[styles.metricValue, { color: theme.colors.text.primary }]}>{batches?.length || 0}</Text>
            </View>
            <View style={[styles.metricTile, { backgroundColor: theme.colors.surface }]}>
              <Text style={[styles.metricLabel, { color: theme.colors.text.secondary }]}>Reorder Pt</Text>
              <Text style={[styles.metricValue, { color: theme.colors.text.primary }]}>{medicine.reorderLevel}</Text>
            </View>
         </View>

         {/* Quick Actions */}
         <View style={styles.actionsRow}>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.colors.primary }]} onPress={handleShortbook}>
              <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.medium, fontSize: 13 }}>+ Shortbook</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium, fontSize: 13 }}>Adjust Stock</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionBtn, { borderColor: theme.colors.border }]}>
              <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium, fontSize: 13 }}>Sales History</Text>
            </TouchableOpacity>
         </View>

         {/* Active Batches */}
         <View style={styles.batchesSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.bold, fontSize: 18 }}>Active Batches</Text>
               <View style={[styles.badgePill, { backgroundColor: theme.colors.primaryLight }]}>
                 <Text style={{ color: theme.colors.primary, fontSize: 12, fontWeight: 'bold' }}>{batches?.length || 0}</Text>
               </View>
            </View>
            
            {isLoadingBatches ? (
              <ActivityIndicator color={theme.colors.primary} />
            ) : batches && batches.length > 0 ? (
               <View style={{ minHeight: 120 }}>
                 <FlashListAny
                   data={batches}
                   keyExtractor={(item: any) => item.id}
                   renderItem={renderBatch}
                   estimatedItemSize={90}
                 />
               </View>
            ) : (
              <Text style={{ color: theme.colors.text.secondary, textAlign: 'center', padding: 20 }}>No active batches</Text>
            )}
         </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingCenter: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 16, borderBottomWidth: 0.5 },
  backBtn: { marginRight: 16 },
  headerTitle: { flex: 1, fontSize: 18 },
  editBtn: { paddingLeft: 16 },
  scrollContent: { padding: 16, paddingBottom: 40 },
  infoCard: { borderRadius: 16, padding: 20, marginBottom: 16, position: 'relative', overflow: 'hidden' },
  h1Badge: { position: 'absolute', top: 0, right: 0, paddingHorizontal: 12, paddingVertical: 4, borderBottomLeftRadius: 16 },
  h1Text: { color: '#FFF', fontSize: 10, fontWeight: 'bold' },
  medName: { fontSize: 22, marginBottom: 4, width: '80%' },
  medGeneric: { fontSize: 15, marginBottom: 16 },
  infoGrid: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', marginTop: 8 },
  infoCol: { width: '30%', marginBottom: 12 },
  infoLabel: { fontSize: 11, marginBottom: 4 },
  infoValue: { fontSize: 13, fontWeight: '500' },
  stockOverview: { flexDirection: 'row', gap: 12, marginBottom: 24 },
  metricTile: { flex: 1, padding: 12, borderRadius: 12, alignItems: 'center' },
  metricLabel: { fontSize: 11, marginBottom: 4 },
  metricValue: { fontSize: 20, fontWeight: 'bold' },
  actionsRow: { flexDirection: 'row', gap: 8, marginBottom: 24 },
  actionBtn: { flex: 1, height: 40, borderWidth: 1, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  batchesSection: { flex: 1 },
  badgePill: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  batchRow: { borderRadius: 12, padding: 12, marginBottom: 10, borderLeftWidth: 4 },
  batchTop: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  batchMid: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  batchBot: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
});
