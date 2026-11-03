import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader } from '@/components/ui/Workspace';
import { ResponsiveGrid } from '@/components/ui/ResponsiveGrid';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { LiquidPanel } from '@/components/glass/LiquidGlass';
import { useState, useRef } from 'react';
import { View, StyleSheet, Alert, ActivityIndicator, Pressable, Switch, useWindowDimensions } from 'react-native';
import { TouchableOpacity, ScrollView } from 'react-native-gesture-handler';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import type GorhomBottomSheet from '@gorhom/bottom-sheet';
import { useQueryClient, useQuery } from '@tanstack/react-query';

import { useTheme } from '@/hooks/useTheme';
import { useAuthStore } from '@/stores/authStore';
import { useUIStore } from '@/stores/uiStore';
import { getInitials } from '@/utils/format';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { mobileLayout } from '@/theme/mobileLayout';
import { clinicApi } from '@/api/clinic';

export default function SettingsScreen() {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const glassMode = useUIStore(s => s.glassMode);
  const setGlassMode = useUIStore(s => s.setGlassMode);
  const toggleTheme = useUIStore(s => s.toggleTheme);
  const qc = useQueryClient();
  const addToast = useUIStore(s => s.addToast);

  const user = useAuthStore(s => s.user);
  const logout = useAuthStore(s => s.logout);


  const [isSyncing, setIsSyncing] = useState(false);

  const logoutSheetRef = useRef<GorhomBottomSheet>(null);

  // Fetch full profile details
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['clinic-profile'],
    queryFn: clinicApi.getProfile,
  });



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
      <GlassMeshBackground />
      <WorkspaceHeader title="Settings" icon="settings-outline" subtitle="Your pharmacy and preferences" onBack={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')} />

      <ScrollView contentContainerStyle={{ padding: layout.gutter, paddingBottom: insets.bottom + 32, width: '100%', maxWidth: 1240, alignSelf: 'center' }} showsVerticalScrollIndicator={false}>

        <ResponsiveGrid>
        <View>
        {/* Profile Section */}
        <LiquidPanel dark={isDark} style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, alignItems: 'center', borderWidth: 1, borderColor: theme.colors.border }]}>
           <View style={[styles.avatarContainer, { borderColor: theme.colors.primary + '30' }]}>
             <View style={[styles.avatarLg, { backgroundColor: theme.colors.primaryLight }]}>
               <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 30 }}>
                 {getInitials(userName).toUpperCase()}
               </Text>
             </View>
           </View>
           <Text style={{ fontFamily: theme.typography.family.bold, fontSize: 22, color: theme.colors.text.primary, marginTop: 12 }}>{userName}</Text>
           <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.regular, fontSize: 14, marginTop: 4 }}>{userEmail}</Text>
           <View style={[styles.roleBadge, { backgroundColor: theme.colors.primaryLight }]}>
             <Ionicons name="shield-checkmark-outline" size={14} color={theme.colors.primary} />
             <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 12 }}>{userRole.toUpperCase()}</Text>
           </View>
        </LiquidPanel>

        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>APPEARANCE</Text>
        <LiquidPanel dark={isDark} style={[styles.card, { padding: 18 }]}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, fontSize: 15 }}>Dark appearance</Text>
              <Text style={{ color: theme.colors.text.secondary, fontSize: 13, marginTop: 4 }}>A softer view after hours.</Text>
            </View>
            <Switch accessibilityLabel="Dark appearance" value={isDark} onValueChange={toggleTheme} thumbColor="#FFFFFF" trackColor={{ false: theme.colors.border, true: '#2457E6' }} />
          </View>
          <View style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 18 }} />
          <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, fontSize: 15 }}>Motion</Text>
          <Text style={{ color: theme.colors.text.secondary, fontSize: 13, lineHeight: 19, marginTop: 5, marginBottom: 14 }}>Choose reduced motion for simpler transitions.</Text>
          <View style={{ flexDirection: layout.largeText ? 'column' : 'row', gap: 8 }}>
            {(['adaptive', 'lightweight'] as const).map(mode => (
              <Pressable key={mode} accessibilityRole="radio" accessibilityState={{ checked: glassMode === mode }} onPress={() => setGlassMode(mode)}
                style={{ flex: layout.largeText ? undefined : 1, minHeight: 48, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: glassMode === mode ? theme.colors.primary : theme.colors.border, backgroundColor: glassMode === mode ? theme.colors.primaryLight : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: glassMode === mode ? theme.colors.primary : theme.colors.text.secondary, fontFamily: theme.typography.family.semiBold, fontSize: 14 }}>{mode === 'adaptive' ? 'Standard motion' : 'Reduced motion'}</Text>
              </Pressable>
            ))}
          </View>
        </LiquidPanel>

        </View>
        <View>
        {/* Legal Details */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>LEGAL DETAILS</Text>
        <LiquidPanel dark={isDark} style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, paddingVertical: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: theme.colors.border }]}>
           <View style={styles.detailRow}>
             <View style={styles.detailLeft}>
               <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryLight }]}>
                 <Ionicons name="finger-print-outline" size={20} color={theme.colors.primary} />
               </View>
               <View style={styles.detailTexts}>
                 <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>GSTIN</Text>
                 <Text style={[styles.detailValue, { color: theme.colors.text.primary }]}>{profile?.gstin || 'Not provided'}</Text>
               </View>
             </View>
           </View>
           <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
           <View style={styles.detailRow}>
             <View style={styles.detailLeft}>
               <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryLight }]}>
                 <Ionicons name="document-text-outline" size={20} color={theme.colors.primary} />
               </View>
               <View style={styles.detailTexts}>
                 <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>Drug License</Text>
                 <Text style={[styles.detailValue, { color: theme.colors.text.primary }]}>{profile?.drug_licence_number || 'Not provided'}</Text>
               </View>
             </View>
           </View>
           <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />
           <View style={styles.detailRow}>
             <View style={styles.detailLeft}>
               <View style={[styles.iconContainer, { backgroundColor: theme.colors.primaryLight }]}>
                 <Ionicons name="location-outline" size={20} color={theme.colors.primary} />
               </View>
               <View style={styles.detailTexts}>
                 <Text style={[styles.detailLabel, { color: theme.colors.text.secondary }]}>Address</Text>
                 <Text style={[styles.detailValue, { color: theme.colors.text.primary }]}>{profile?.address || 'Not provided'}</Text>
               </View>
             </View>
           </View>
        </LiquidPanel>

        {/* Data */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>DATA</Text>
        <LiquidPanel dark={isDark} style={[styles.card, { backgroundColor: theme.colors.surface, ...theme.shadow.card, gap: 0, padding: 0, borderWidth: 1, borderColor: theme.colors.border, overflow: 'hidden' }]}>
           <TouchableOpacity style={[styles.menuRow, { borderBottomColor: theme.colors.border }]} onPress={handleExport}>
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <View style={[styles.menuIconContainer, { backgroundColor: theme.colors.primaryLight }]}>
                 <Ionicons name="download-outline" size={20} color={theme.colors.primary} />
               </View>
               <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.medium, color: theme.colors.text.primary, fontSize: 15 }}>Export Data</Text>
             </View>
             <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />
           </TouchableOpacity>
           <TouchableOpacity style={[styles.menuRow, { borderBottomWidth: 0 }]} onPress={handleSync} disabled={isSyncing}>
             <View style={{ flexDirection: 'row', alignItems: 'center' }}>
               <View style={[styles.menuIconContainer, { backgroundColor: theme.colors.primaryLight }]}>
                 <Ionicons name="sync-outline" size={20} color={theme.colors.primary} />
               </View>
               <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.medium, color: theme.colors.text.primary, fontSize: 15 }}>Sync Now</Text>
             </View>
             {isSyncing ? <ActivityIndicator size="small" color={theme.colors.primary} /> : <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />}
           </TouchableOpacity>
        </LiquidPanel>

        {/* Sign Out */}
        <Text style={[styles.sectionTitle, { color: theme.colors.text.secondary }]}>ACCOUNT</Text>
        <TouchableOpacity
          style={[styles.card, styles.dangerCard, { backgroundColor: theme.colors.dangerLight, borderColor: theme.colors.danger + '30', borderWidth: 1 }]}
          activeOpacity={0.75}
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            requestAnimationFrame(() => {
              logoutSheetRef.current?.expand();
            });
          }}
        >
           <View style={[styles.menuIconContainer, { backgroundColor: 'rgba(229, 62, 62, 0.12)' }]}>
             <Ionicons name="log-out-outline" size={20} color={theme.colors.danger} />
           </View>
           <Text style={{ marginLeft: 12, fontFamily: theme.typography.family.semiBold, color: theme.colors.danger, fontSize: 15 }}>Sign Out</Text>
        </TouchableOpacity>

        </View>
        </ResponsiveGrid>
        {/* App Info */}
        <Text style={{ textAlign: 'center', color: theme.colors.text.tertiary, fontSize: 12, marginTop: 12 }}>
          Nexsyrus v1.1.0
        </Text>
      </ScrollView>

      <BottomSheet ref={logoutSheetRef} snapPoints={['42%', '55%']} title="Confirm Sign Out">
         <View style={{ paddingHorizontal: 24, paddingBottom: 24, alignItems: 'center', width: '100%' }}>
            <View style={[styles.warningIconContainer, { backgroundColor: theme.colors.dangerLight }]}>
              <Ionicons name="log-out-outline" size={32} color={theme.colors.danger} />
            </View>
            <Text style={[styles.sheetDescription, { color: theme.colors.text.secondary, fontFamily: theme.typography.family.regular }]}>
              Are you sure you want to sign out? You will need to log back in to access your pharmacy POS dashboard.
            </Text>
            <View style={styles.sheetButtonsContainer}>
              <TouchableOpacity 
                style={[styles.logoutFinalBtn, { backgroundColor: theme.colors.danger }]}
                onPress={handleLogout}
                activeOpacity={0.85}
              >
                <Text style={[styles.logoutBtnText, { fontFamily: theme.typography.family.semiBold }]}>Sign Out</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.cancelBtn, { borderColor: theme.colors.border }]}
                onPress={() => logoutSheetRef.current?.close()}
                activeOpacity={0.85}
              >
                <Text style={[styles.cancelBtnText, { color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
         </View>
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.05)' },
  card: { borderRadius: 16, padding: 16, marginBottom: 12 },
  avatarContainer: {
    padding: 4,
    borderRadius: 48,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  avatarLg: { width: 80, height: 80, borderRadius: 40, justifyContent: 'center', alignItems: 'center' },
  roleBadge: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, marginTop: 12, gap: 6 },
  planBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  upgradeBtn: { height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginTop: 20 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 8, marginLeft: 4, marginTop: 8 },
  menuRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 0.5 },
  dangerCard: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16 },
  warningIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  sheetDescription: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  sheetButtonsContainer: {
    width: '100%',
    gap: 12,
  },
  logoutFinalBtn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    alignSelf: 'stretch',
  },
  logoutBtnText: {
    color: '#FFF',
    fontSize: 16,
  },
  cancelBtn: {
    height: 48,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    backgroundColor: 'transparent',
    alignSelf: 'stretch',
  },
  cancelBtnText: {
    fontSize: 16,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconContainer: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  detailTexts: {
    flex: 1,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  separator: { height: 0.5, width: '100%', marginVertical: 4 },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowAlign: { flexDirection: 'row', alignItems: 'center' },
});

