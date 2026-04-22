import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, ActivityIndicator, Animated } from 'react-native';
import { FlashList } from '@shopify/flash-list';
const FlashListAny = FlashList as any;
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';

import { useTheme } from '@/hooks/useTheme';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { useCustomersPaginated, useDueReminders } from '@/hooks/useCustomers';
import { formatCurrency, formatRelative, getInitials } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { Customer } from '@/api/customers';

const FILTERS = ['All', 'High Value', 'At Risk', 'With Balance'];

export default function PatientsIndexScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const bottomSheetRef = useRef<GorhomBottomSheet>(null);

  const {
    data,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useCustomersPaginated({ q: debouncedSearch, limit: 20 });

  const { data: reminders } = useDueReminders();

  const handleSearch = (text: string) => {
    setSearch(text);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedSearch(text), 300);
  };

  const handlePatientPress = (id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push(`/(app)/patients/${id}`);
  };

  const customers = useMemo(() => {
    return data?.pages.flatMap((p) => p.data) || [];
  }, [data]);

  const totalCustomers = data?.pages[0]?.pagination?.total ?? 0;

  const getAvatarColor = (name: string) => {
    const colors = [
      theme.colors.primaryLight,
      theme.colors.accentLight,
      theme.colors.warningLight,
      theme.colors.dangerLight,
    ];
    const charCode = name.charCodeAt(0) || 0;
    return colors[charCode % colors.length];
  };

  const renderRightActions = (progress: any, dragX: any, customer: Customer) => {
    const scale = dragX.interpolate({
      inputRange: [-80, 0],
      outputRange: [1, 0],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity 
         style={[styles.swipeAction, { backgroundColor: theme.colors.success }]} 
         onPress={() => {
           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
           router.push({ pathname: `/(app)/patients/${customer.id}`, params: { action: 'payment' } });
         }}
      >
        <Animated.View style={{ transform: [{ scale }] }}>
          <Ionicons name="card-outline" size={24} color="#FFF" />
          <Text style={styles.actionText}>Payment</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderLeftActions = (progress: any, dragX: any, customer: Customer) => {
    const scale = dragX.interpolate({
      inputRange: [0, 80],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
    return (
      <TouchableOpacity 
         style={[styles.swipeAction, styles.swipeActionLeft, { backgroundColor: theme.colors.primary }]} 
         onPress={() => {
           Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
           // Handle add reminder
         }}
      >
        <Animated.View style={{ transform: [{ scale }], alignItems: 'flex-start' }}>
          <Ionicons name="notifications-outline" size={24} color="#FFF" />
          <Text style={styles.actionText}>Reminder</Text>
        </Animated.View>
      </TouchableOpacity>
    );
  };

  const renderPatientCard = ({ item }: { item: Customer }) => {
    const avatarColor = getAvatarColor(item.name);
    const balance = item.outstandingBalance || 0;
    const score = item.importanceScore ?? 0;

    return (
      <Swipeable
        renderRightActions={(prog, drag) => renderRightActions(prog, drag, item)}
        renderLeftActions={(prog, drag) => renderLeftActions(prog, drag, item)}
        friction={2}
      >
        <TouchableOpacity 
          style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}
          onPress={() => handlePatientPress(item.id)}
          activeOpacity={0.9}
        >
          <View style={[styles.avatar, { backgroundColor: avatarColor }]}>
            <Text style={[styles.avatarText, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]}>
              {getInitials(item.name)}
            </Text>
          </View>
          
          <View style={styles.centerCol}>
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <Text style={[styles.name, { color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }]} numberOfLines={1}>
                 {item.name}
               </Text>
               {score >= 80 ? (
                 <Ionicons name="star" size={14} color="#FBBF24" style={{ marginLeft: 6 }} />
               ) : score >= 50 ? (
                 <Ionicons name="star-half" size={14} color="#94A3B8" style={{ marginLeft: 6 }} />
               ) : null}
             </View>
             
             <View style={styles.phoneRow}>
               <Ionicons name="call-outline" size={12} color={theme.colors.text.secondary} />
               <Text style={[styles.phone, { color: theme.colors.text.secondary }]}>{item.phone}</Text>
             </View>
             
             {item.lastPurchaseDate && (
               <Text style={[styles.date, { color: theme.colors.text.tertiary }]}>
                 Last visit {formatRelative(item.lastPurchaseDate)}
               </Text>
             )}
          </View>

          <View style={styles.rightCol}>
            {balance > 0 ? (
              <View style={[styles.dangerPill, { backgroundColor: theme.colors.dangerLight }]}>
                 <Text style={{ color: theme.colors.danger, fontFamily: theme.typography.family.bold, fontSize: 13 }}>
                   {formatCurrency(balance)}
                 </Text>
                 <Text style={{ color: theme.colors.danger, fontSize: 10, textAlign: 'center', marginTop: -2 }}>Due</Text>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={[styles.successDot, { backgroundColor: theme.colors.success }]} />
                <Text style={{ color: theme.colors.success, fontSize: 11, fontFamily: theme.typography.family.medium }}>Settled</Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Swipeable>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <GlassMeshBackground />
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.headerTop}>
          <View>
            <Text style={[styles.title, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>Patients</Text>
            <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>
              {totalCustomers.toLocaleString()} total
            </Text>
          </View>

          <TouchableOpacity onPress={() => bottomSheetRef.current?.expand()} style={styles.bellBtn} hitSlop={10}>
             <Ionicons name="notifications-outline" size={26} color={theme.colors.text.primary} />
             {reminders && reminders.length > 0 && (
               <View style={[styles.bellBadge, { backgroundColor: theme.colors.danger }]}>
                 <Text style={{ color: '#FFF', fontSize: 10, fontWeight: 'bold' }}>{reminders.length}</Text>
               </View>
             )}
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: theme.colors.background }]}>
          <Ionicons name="search" size={20} color={theme.colors.text.secondary} />
          <TextInput
            style={[styles.searchInput, { color: theme.colors.text.primary, fontFamily: theme.typography.family.regular }]}
            placeholder="Search patients..."
            placeholderTextColor={theme.colors.text.tertiary}
            value={search}
            onChangeText={handleSearch}
          />
        </View>

        {/* Filters */}
        <View style={styles.filterRow}>
          {FILTERS.map(f => (
            <TouchableOpacity 
              key={f} 
              onPress={() => { Haptics.selectionAsync(); setActiveFilter(f); }}
              style={[
                styles.filterChip, 
                { backgroundColor: activeFilter === f ? theme.colors.primary : theme.colors.background }
              ]}
            >
              <Text style={{ 
                color: activeFilter === f ? '#FFF' : theme.colors.text.secondary,
                fontFamily: activeFilter === f ? theme.typography.family.semiBold : theme.typography.family.regular,
                fontSize: 13
              }}>{f}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* List */}
      <View style={styles.listContainer}>
        {isLoading && !data ? (
          <ActivityIndicator style={{ marginTop: 40 }} size="large" color={theme.colors.primary} />
        ) : (
          <FlashListAny
            data={customers}
            keyExtractor={(item: Customer) => item.id}
            estimatedItemSize={90}
            renderItem={renderPatientCard}
            contentContainerStyle={{ paddingVertical: 12 }}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) {
                fetchNextPage();
              }
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              isFetchingNextPage ? <ActivityIndicator style={{ margin: 20 }} color={theme.colors.primary} /> : null
            }
          />
        )}
      </View>

      <TouchableOpacity 
        style={[styles.fab, { backgroundColor: theme.colors.primary, ...theme.shadow.card }]}
        onPress={() => router.push('/(app)/patients/add')}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Reminders Bottom Sheet */}
      <BottomSheet ref={bottomSheetRef} snapPoints={['60%']} title="Due Reminders">
         <View style={{ padding: 16 }}>
           {reminders?.length ? reminders.map(r => (
             <View key={r.customerId} style={{ padding: 12, backgroundColor: theme.colors.background, borderRadius: 12, marginBottom: 12 }}>
               <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary, fontSize: 16 }}>{r.customerName}</Text>
               <Text style={{ color: theme.colors.text.secondary, marginTop: 4 }}>Due: {formatCurrency(r.totalDue)} ({r.invoiceCount} invoices)</Text>
             </View>
           )) : (
             <Text style={{ color: theme.colors.text.secondary, textAlign: 'center', marginTop: 40 }}>No due reminders found.</Text>
           )}
         </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 16, paddingBottom: 12, borderBottomLeftRadius: 16, borderBottomRightRadius: 16 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 28 },
  subtitle: { fontSize: 14, marginTop: 2 },
  bellBtn: { position: 'relative', padding: 4 },
  bellBadge: { position: 'absolute', top: 0, right: 0, minWidth: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center', zIndex: 1 },
  searchBar: { flexDirection: 'row', alignItems: 'center', height: 48, borderRadius: 12, paddingHorizontal: 12, marginBottom: 16 },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 16 },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  listContainer: { flex: 1 },
  card: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 16, marginHorizontal: 16, marginBottom: 10 },
  avatar: { width: 52, height: 52, borderRadius: 26, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 18 },
  centerCol: { flex: 1 },
  name: { fontSize: 16, marginBottom: 4 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4, gap: 4 },
  phone: { fontSize: 13 },
  date: { fontSize: 12 },
  rightCol: { alignItems: 'flex-end', marginLeft: 8 },
  dangerPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, minWidth: 60, alignItems: 'center' },
  successDot: { width: 6, height: 6, borderRadius: 3 },
  swipeAction: { justifyContent: 'center', alignItems: 'flex-end', width: 90, borderRadius: 16, marginVertical: 0, marginBottom: 10, marginRight: 16, paddingHorizontal: 20 },
  swipeActionLeft: { alignItems: 'flex-start', marginLeft: 16, marginRight: 0 },
  actionText: { color: '#FFF', fontSize: 11, fontWeight: 'bold', marginTop: 4 },
  fab: { position: 'absolute', bottom: 24, right: 24, width: 56, height: 56, borderRadius: 28, justifyContent: 'center', alignItems: 'center' }
});
