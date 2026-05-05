import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, ActivityIndicator, Linking } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { useQueryClient, useQuery } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { getInitials } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { clinicApi } from '@/api/clinic';

export default function SettingsScreen() {
  const { theme, isDark, toggleTheme } = useTheme();
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  const logoutSheetRef = useRef<GorhomBottomSheet>(null);

  // Fetch full profile details
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['clinic-profile'],
    queryFn: clinicApi.getProfile,
  });

  const handleTogglePush = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPushEnabled(value);
    if (value) {
      addToast('Push notifications enabled', 'success');
    } else {
      addToast('Push notifications disabled', 'info');
    }
  };

  const handleSync = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsSyncing(true);
    await qc.invalidateQueries({ queryKey: ['dashboard'] });
    await qc.invalidateQueries({ queryKey: ['medicines'] });
    await qc.invalidateQueries({ queryKey: ['sales'] });
    await qc.invalidateQueries({ queryKey: ['clinic-profile'] });
    setTimeout(() => {
      setIsSyncing(false);
      addToast('Data synced successfully', 'success');
    }, 1000);
  };

  const handleUpgrade = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert(
      'Manual Upgrade',
      'Plan upgrades are managed by the administration. Please contact the SuperAdmin or visit the main office for physical payment and account activation.',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Contact Support', 
          onPress: () => {
            // Placeholder: Replace with actual contact logic if needed
            Alert.alert('Support', 'Please contact support at support@nexsyrus.com');
          }
        }
      ]
    );
  };

  const handleExport = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.push('/(app)/reports/accounting');
  };

  const handleLogout = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    logoutSheetRef.current?.close();
    logout();
    qc.clear();
    router.replace('/(auth)/login');
  };

  const userName = profile?.name || user?.name || 'User';
  const userEmail = profile?.email || user?.email || 'user@pharmacy.com';
  const userRole = user?.role || 'Admin';
  const currentPlan = profile?.plan?.toUpperCase() || 'TRIAL';

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface }]}>
         <TouchableOpacity onPress={() => router.back()} style={{ marginRight: 16 }} hitSlop={10}>
           <Ionicons name="arrow-back" size={24} color={theme.colors.text.primary} />
         </TouchableOpacity>
         <Text style={{ fontSize: 24, fontFamily: theme.typography.family.bold, color: theme.colors.text.primary }}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 60 }} showsVerticalScrollIndicator={false}>

        {/* Profile Section */}
        <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, alignItems: 'center' }]}>
           <View style={[styles.avatarLg, { backgroundColor: theme.colors.primaryLight }]}>
             <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 28 }}>
               {getInitials(userName)}
             </Text>
           </View>
           <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 22, color: theme.colors.text.primary, marginTop: 12 }}>{userName}</Text>
           <Text style={{ color: theme.colors.text.secondary, marginTop: 4 }}>{userEmail}</Text>
           <View style={[styles.roleBadge, { backgroundColor: theme.colors.primaryLight }]}>
             <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 12 }}>{userRole}</Text>
           </View>
        </View>


        {/* Legal Details */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>LEGAL DETAILS</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, gap: 16 }]}>
           <View style={styles.detailItem}>
             <View style={styles.rowAlign}>
               <Ionicons name="finger-print-outline" size={16} color={theme.colors.primary} />
               <Text style={[styles.detailLabel, { color: theme.colors.text.secondary, marginLeft: 8 }]}>GSTIN</Text>
             </View>
             <Text style={[styles.detailValue, { color: theme.colors.text.primary, marginLeft: 24 }]}>{profile?.gstin || 'Not provided'}</Text>
           </View>
           <View style={styles.detailItem}>
             <View style={styles.rowAlign}>
               <Ionicons name="document-text-outline" size={16} color={theme.colors.primary} />
               <Text style={[styles.detailLabel, { color: theme.colors.text.secondary, marginLeft: 8 }]}>Drug License</Text>
             </View>
             <Text style={[styles.detailValue, { color: theme.colors.text.primary, marginLeft: 24 }]}>{profile?.drug_licence_number || 'Not provided'}</Text>
           </View>
           <View style={styles.detailItem}>
             <View style={styles.rowAlign}>
               <Ionicons name="location-outline" size={16} color={theme.colors.primary} />
               <Text style={[styles.detailLabel, { color: theme.colors.text.secondary, marginLeft: 8 }]}>Address</Text>
             </View>
             <Text style={[styles.detailValue, { color: theme.colors.text.primary, marginLeft: 24 }]}>{profile?.address || 'Not provided'}</Text>
           </View>
        </View>

        {/* Appearance */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>APPEARANCE</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
           <View style={styles.rowBetween}>
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <Ionicons name={isDark ? 'moon' : 'sunny-outline'} size={22} color={theme.colors.text.primary} />
               <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.medium, color: theme.colors.text.primary }}>Dark Mode</Text>
             </View>
             <Switch
               value={isDark}
               onValueChange={() => { Haptics.selectionAsync(); toggleTheme(); }}
               trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
               thumbColor="#FFF"
             />
           </View>
        </View>

        {/* Notifications */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>NOTIFICATIONS</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
           <View style={styles.rowBetween}>
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <Ionicons name="notifications-outline" size={22} color={theme.colors.text.primary} />
               <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.medium, color: theme.colors.text.primary }}>Push Notifications</Text>
             </View>
             <Switch
               value={pushEnabled}
               onValueChange={handleTogglePush}
               trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
               thumbColor="#FFF"
             />
           </View>
        </View>

        {/* Data */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>DATA</Text>
        <View style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, gap: 0, padding: 0 }]}>
           <TouchableOpacity style={[styles.menuRow, { borderBottomColor: theme.colors.border }]} onPress={handleExport}>
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <Ionicons name="download-outline" size={22} color={theme.colors.text.primary} />
               <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.medium, color: theme.colors.text.primary }}>Export Data</Text>
             </View>
             <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />
           </TouchableOpacity>
           <TouchableOpacity style={[styles.menuRow, { borderBottomWidth: 0 }]} onPress={handleSync} disabled={isSyncing}>
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <Ionicons name="sync-outline" size={22} color={theme.colors.text.primary} />
               <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.medium, color: theme.colors.text.primary }}>Sync Now</Text>
             </View>
             {isSyncing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />}
           </TouchableOpacity>
        </View>

        {/* Sign Out */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>ACCOUNT</Text>
        <TouchableOpacity
          style={[styles.card, styles.dangerCard, { borderColor: theme.colors.danger }]}
          activeOpacity={0.75}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            // expand() is reliable when opening from index -1; snapToIndex(0) can no-op with dynamic sizing / timing
            requestAnimationFrame(() => {
              logoutSheetRef.current?.expand();
            });
          }}
        >
           <Ionicons name="log-out-outline" size={22} color={theme.colors.danger} />
           <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.semiBold, color: theme.colors.danger }}>Sign Out</Text>
        </TouchableOpacity>

        {/* App Info */}
        <Text style={{ textAlign: 'center', color: theme.colors.text.tertiary, fontSize: 12, marginTop: 24 }}>
          MedPOS v1.1.0 • Built with Expo
        </Text>
      </ScrollView>

      <BottomSheet ref={logoutSheetRef} snapPoints={['38%', '55%']} title="Confirm Sign Out">
         <View style={{ padding: 24, alignItems: 'center' }}>
            <Text style={{ color: theme.colors.text.secondary, textAlign: 'center', marginBottom: 24 }}>
              Are you sure you want to sign out? You will need to log back in.
            </Text>
            <TouchableOpacity 
              style={[styles.logoutFinalBtn, { backgroundColor: theme.colors.danger }]}
              onPress={handleLogout}
            >
              <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Sign Out</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={{ marginTop: 12 }}
              onPress={() => logoutSheetRef.current?.close()}
            >
              <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }}>Cancel</Text>
            </TouchableOpacity>
         </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  card: { borderRadius: 16, padding: 20, marginBottom: 16 },
  avatarLg: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  roleBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12, marginTop: 12 },
  planBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  upgradeBtn: { height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginLeft: 4, marginTop: 8 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 0.5 },
  dangerCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, backgroundColor: 'transparent' },
  logoutFinalBtn: { height: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center', width: '100%' },
  detailItem: { gap: 4 },
  detailLabel: { fontSize: 12, fontWeight: '600' },
  detailValue: { fontSize: 14, fontWeight: '500' },
  rowAlign: { flexDirection: 'row', alignItems: 'center' },
});
