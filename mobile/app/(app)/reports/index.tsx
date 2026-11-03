import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceChip } from '@/components/ui/Workspace';
import { ResponsiveGrid } from '@/components/ui/ResponsiveGrid';
import { mobileLayout } from '@/theme/mobileLayout';
import { LiquidPanel, useGlassPreferences } from '@/components/glass/LiquidGlass';
import { useState, useEffect, useMemo } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions, LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import { Canvas, Path, Skia, LinearGradient as SkiaLinearGradient, vec } from '@shopify/react-native-skia';
import { FlashList } from '@shopify/flash-list';

import { useTheme } from '@/hooks/useTheme';
import { GlassMeshBackground } from '@/components/ui/GlassMeshBackground';
import { useProfitLoss, useGstSales, useScheduleH1 } from '@/hooks/useReports';
import { useRevenueTrend, useMedicinePerformance, useInventoryHealth, useCustomerInsights, usePaymentBehaviour } from '@/hooks/useAnalytics';
import { formatCurrency, formatDate } from '@/utils/format';
import { getInitials } from '@/utils/format';
import { useUIStore } from '@/stores/uiStore';

const TABS = ['Overview', 'Products', 'Customers', 'Tax & Compliance'];
function useReportLayout() {
  const { width, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const contentWidth = Math.min(width - 32, 1200);
  return {
    ...layout,
    cardWidth: layout.compact ? contentWidth : (contentWidth - (layout.wide ? 36 : 12)) / (layout.wide ? 4 : 2),
    scrollStyle: { padding: 16, paddingBottom: insets.bottom + 32, width: '100%' as const, maxWidth: 1232, alignSelf: 'center' as const },
    tableWidth: Math.max(contentWidth, 620 * Math.max(1, fontScale)),
  };
}

// ─── TAB COMPONENTS ──────────────────────────────────────────────────────────

function OverviewTab({ from, to }: { from: string, to: string }) {
  const { theme, isDark } = useTheme();
  const layout = useReportLayout();
  const { data: plData, isLoading: isLoadingPl } = useProfitLoss(from, to);
  const { data: rtData, isLoading: isLoadingRt } = useRevenueTrend('daily', '30d');
  const { data: pbData, isLoading: isLoadingPb } = usePaymentBehaviour();

  const [chartWidth, setChartWidth] = useState(0);
  const { reduceMotion } = useGlassPreferences();
  const progress = useSharedValue(1);

  useEffect(() => {
    progress.value = 0;
    progress.value = reduceMotion ? 1 : withTiming(1, { duration: 450, easing: Easing.out(Easing.cubic) });
  }, [rtData, reduceMotion, progress]);

  const { linePath, areaPath, points } = useMemo(() => {
    if (!rtData || chartWidth === 0) return { linePath: Skia.Path.Make(), areaPath: Skia.Path.Make(), points: [] };
    const maxRev = Math.max(...rtData.map(d => d.revenue), 1);
    const minRev = Math.min(...rtData.map(d => d.revenue), 0);
    const rangeY = maxRev - minRev || 1;
    
    const lPath = Skia.Path.Make();
    const aPath = Skia.Path.Make();
    
    const pts = rtData.map((d, i) => {
      const x = rtData.length <= 1 ? chartWidth / 2 : (i / (rtData.length - 1)) * chartWidth;
      const y = 180 - ((d.revenue - minRev) / rangeY) * 160; 
      return { x, y, val: d.revenue, label: d.date };
    });

    pts.forEach((p, i) => {
      if (i === 0) { lPath.moveTo(p.x, p.y); aPath.moveTo(p.x, p.y); }
      else { lPath.lineTo(p.x, p.y); aPath.lineTo(p.x, p.y); }
    });

    aPath.lineTo(chartWidth, 200);
    aPath.lineTo(0, 200);
    aPath.close();

    return { linePath: lPath, areaPath: aPath, points: pts };
  }, [rtData, chartWidth]);

  const donutPaths = useMemo(() => {
    if (!pbData) return [];
    
    const total = pbData.byMode.reduce((sum, item) => sum + (item.amount || item.count), 0) || 1;
    let startAngle = 0;
    const cx = 90, cy = 90, r = 70;
    
    const colors = [theme.colors.primary, theme.colors.accent, theme.colors.warning, theme.colors.danger];
    
    return pbData.byMode.map((item, i) => {
       const sweepAngle = ((item.amount || item.count) / total) * 360;
       const path = Skia.Path.Make();
       path.addArc({ x: cx - r, y: cy - r, width: r * 2, height: r * 2 }, startAngle, sweepAngle);
       startAngle += sweepAngle;
       return { path, color: colors[i % colors.length], ...item, pct: Math.round(((item.amount || item.count) / total) * 100) };
    });
  }, [pbData, theme]);

  if (isLoadingPl || isLoadingRt || isLoadingPb) return <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} size="large" />;

  const pl = plData ?? {
    totalRevenue: 0,
    totalReturns: 0,
    netProfit: 0,
    expenses: 0,
  };
  const aging = pbData?.outstandingAging ?? { d0_7: 0, d8_30: 0, d31_60: 0, d60p: 0 };
  const outstandingAmounts = [aging.d0_7, aging.d8_30, aging.d31_60, aging.d60p];
  const maxOutstanding = Math.max(...outstandingAmounts, 1);
  const hasPaymentData = (pbData?.byMode?.length ?? 0) > 0;
  const hasRevenueData = (rtData?.length ?? 0) > 0;

  return (
    <ScrollView contentContainerStyle={layout.scrollStyle} showsVerticalScrollIndicator={false}>
       <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
         {[ 
           { label: 'Gross Revenue', val: pl.totalRevenue, color: theme.colors.primary },
           { label: 'Net Profit', val: pl.netProfit, color: pl.netProfit >= 0 ? theme.colors.success : theme.colors.danger },
           { label: 'Total Returns', val: pl.totalReturns, color: theme.colors.warning },
           { label: 'Total Expenses', val: pl.expenses, color: theme.colors.danger }
         ].map((box, i) => (
           <LiquidPanel dark={isDark} key={i} style={[styles.box, { backgroundColor: theme.colors.surface, ...theme.shadow.card, width: layout.cardWidth }]}>
              <Text style={{ color: theme.colors.text.secondary, fontSize: 13 }}>{box.label}</Text>
              <Text style={{ color: box.color, fontFamily: theme.typography.family.bold, fontSize: 18, marginTop: 8 }}>{formatCurrency(box.val)}</Text>
           </LiquidPanel>
         ))}
       </View>

       <ResponsiveGrid>
       <View>
       <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Revenue Trend (30d)</Text>
       <LiquidPanel dark={isDark} style={[styles.chartCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]} onLayout={(e: LayoutChangeEvent) => setChartWidth(e.nativeEvent.layout.width - 32)}>
          {hasRevenueData ? (
            <>
              <Canvas style={{ width: '100%', height: 200 }}>
                 <Path path={areaPath} style="fill">
                   <SkiaLinearGradient start={vec(0, 0)} end={vec(0, 200)} colors={[theme.colors.primary + '40', theme.colors.background]} />
                 </Path>
                 <Path path={linePath} color={theme.colors.primary} style="stroke" strokeWidth={3} strokeCap="round" strokeJoin="round" start={0} end={progress} />
              </Canvas>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginTop: 8 }}>
                {points.filter((_, i) => i % 6 === 0).map(p => (
                   <Text key={p.label} style={{ fontSize: 10, color: theme.colors.text.tertiary }}>{formatDate(p.label).split(' ')[0]}</Text>
                ))}
              </View>
            </>
          ) : (
            <Text style={{ color: theme.colors.text.tertiary, textAlign: 'center', paddingVertical: 40 }}>No sales in the last 30 days.</Text>
          )}
       </LiquidPanel>

       </View>
       <View>
       <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Payment Behaviour</Text>
       <LiquidPanel dark={isDark} style={[styles.chartCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card, flexDirection: 'row', alignItems: 'center' }]}>
          {hasPaymentData ? (
            <>
              <View style={{ width: 180, height: 180, justifyContent: 'center', alignItems: 'center' }}>
                 <Canvas style={{ position: 'absolute', width: 180, height: 180 }}>
                   {donutPaths.map((d, i) => (
                     <Path key={i} path={d.path} color={d.color} style="stroke" strokeWidth={24} strokeCap="round" start={0} end={progress} />
                   ))}
                 </Canvas>
                 <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.text.primary }}>Payments</Text>
              </View>
              <View style={{ flex: 1, paddingLeft: 16, gap: 12 }}>
                 {donutPaths.map(d => (
                   <View key={d.mode} style={{ flexDirection: 'row', alignItems: 'center' }}>
                     <View style={{ width: 12, height: 12, backgroundColor: d.color, borderRadius: 6, marginRight: 8 }} />
                     <Text style={{ flex: 1, fontSize: 13, color: theme.colors.text.secondary, textTransform: 'capitalize' }}>{d.mode}</Text>
                     <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 13 }}>{d.pct}%</Text>
                   </View>
                 ))}
              </View>
            </>
          ) : (
            <Text style={{ color: theme.colors.text.tertiary, textAlign: 'center', flex: 1, paddingVertical: 24 }}>No payment data yet.</Text>
          )}
       </LiquidPanel>

       </View>
       </ResponsiveGrid>
       <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Outstanding Aging</Text>
       <LiquidPanel dark={isDark} style={[styles.chartCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card, gap: 16 }]}>
          {[
            { label: '0-7 days', val: outstandingAmounts[0], color: theme.colors.success },
            { label: '8-30 days', val: outstandingAmounts[1], color: theme.colors.primary },
            { label: '31-60 days', val: outstandingAmounts[2], color: theme.colors.warning },
            { label: '60+ days', val: outstandingAmounts[3], color: theme.colors.danger }
          ].map(bar => (
             <View key={bar.label}>
               <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                  <Text style={{ fontSize: 13, color: theme.colors.text.secondary }}>{bar.label}</Text>
                  <Text style={{ fontSize: 13, fontFamily: theme.typography.family.semiBold }}>{formatCurrency(bar.val)}</Text>
               </View>
               <View style={{ height: 8, backgroundColor: theme.colors.border, borderRadius: 4, overflow: 'hidden' }}>
                  <View style={{ height: 8, backgroundColor: bar.color, width: `${(bar.val / maxOutstanding) * 100}%`, borderRadius: 4 }} />
               </View>
             </View>
          ))}
       </LiquidPanel>
    </ScrollView>
  );
}

function ProductsTab({ from, to }: { from: string; to: string }) {
  const { theme, isDark } = useTheme();
  const layout = useReportLayout();
  const { data: perfData, isLoading: isLoadingPerf } = useMedicinePerformance({ from, to, sort: 'revenue' });
  const { data: invData, isLoading: isLoadingInv } = useInventoryHealth();

  if (isLoadingPerf || isLoadingInv || !invData) return <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} size="large" />;

  const products = perfData ?? [];
  const maxRev = Math.max(...products.map(p => p.revenue), 1);

  return (
    <View style={{ flex: 1 }}>
       <View style={{ padding: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: 'Total Inventory Value', val: formatCurrency(invData.totalInventoryValue) },
              { label: 'Expiry Risk Value', val: formatCurrency(invData.expiryRiskValue), color: theme.colors.danger },
              { label: 'Turnover Ratio', val: `${invData.turnoverRatio}x` },
              { label: 'Days of Supply', val: `${invData.daysOfSupply} days` }
            ].map((box, i) => (
              <LiquidPanel dark={isDark} key={i} style={[styles.box, { backgroundColor: theme.colors.surface, ...theme.shadow.card, width: layout.cardWidth }]}>
                 <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{box.label}</Text>
                 <Text style={{ color: box.color || theme.colors.primary, fontFamily: theme.typography.family.bold, fontSize: 16, marginTop: 8 }}>{box.val}</Text>
              </LiquidPanel>
            ))}
          </View>
       </View>
       
       <Text style={[styles.sectionTitle, { color: theme.colors.text.primary, marginLeft: 16, marginTop: 8 }]}>Top Products by Revenue</Text>
       {products.length === 0 ? (
         <Text style={{ color: theme.colors.text.tertiary, textAlign: 'center', marginTop: 24 }}>No product sales in this period.</Text>
       ) : (
       <FlashList
         data={products}
         keyExtractor={(i: any) => i.medicineId}
         contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
         renderItem={({ item, index }: any) => {
           let rankColor = theme.colors.text.tertiary;
           if (index === 0) rankColor = '#FBBF24';
           else if (index === 1) rankColor = '#94A3B8';
           else if (index === 2) rankColor = '#B45309';

           return (
             <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16, backgroundColor: theme.colors.surface, padding: 12, borderRadius: 12 }}>
                <View style={[styles.rankCirle, { borderColor: rankColor }]}>
                  <Text style={{ color: rankColor, fontSize: 12, fontFamily: theme.typography.family.bold }}>{index + 1}</Text>
                </View>
                <View style={{ flex: 1, paddingRight: 16 }}>
                  <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary, marginBottom: 8 }}>{item.name}</Text>
                  <View style={{ height: 6, backgroundColor: theme.colors.primaryLight, borderRadius: 3 }}>
                    <View style={{ height: '100%', width: `${(item.revenue / maxRev) * 100}%`, backgroundColor: theme.colors.primary, borderRadius: 3 }} />
                  </View>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.text.primary }}>{formatCurrency(item.revenue)}</Text>
                  <Text style={{ fontSize: 11, color: theme.colors.text.secondary }}>{item.quantitySold} sold</Text>
                </View>
             </View>
           );
         }}
       />
       )}
    </View>
  );
}

function CustomersTab() {
  const { theme, isDark } = useTheme();
  const layout = useReportLayout();
  const { data, isLoading } = useCustomerInsights();

  if (isLoading || !data) return <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} size="large" />;

  const segments = [
    { label: 'High Value', count: data.segments.highValue, sub: 'VIP Patients', bg: theme.colors.warningLight, col: theme.colors.warning },
    { label: 'Regular', count: data.segments.regular, sub: 'Active', bg: theme.colors.primaryLight, col: theme.colors.primary },
    { label: 'At Risk', count: data.segments.atRisk, sub: 'Need attention', bg: theme.colors.warningLight, col: theme.colors.warning },
    { label: 'Lost', count: data.segments.lost, sub: 'Inactive 60d+', bg: theme.colors.dangerLight, col: theme.colors.danger },
  ];

  const topCustomers = data.topCustomers;

  return (
    <ScrollView contentContainerStyle={layout.scrollStyle}>
       <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={[styles.statBoxLine, { borderColor: theme.colors.border }]}>
            <Text style={{ fontSize: 20, fontFamily: theme.typography.family.bold, color: theme.colors.primary }}>{data.newCustomersThisMonth}</Text>
            <Text style={{ fontSize: 11, color: theme.colors.text.secondary, textAlign: 'center' }}>New Users</Text>
          </View>
          <View style={[styles.statBoxLine, { borderColor: theme.colors.border }]}>
            <Text style={{ fontSize: 20, fontFamily: theme.typography.family.bold, color: theme.colors.primary }}>{data.returningCustomersPct}%</Text>
            <Text style={{ fontSize: 11, color: theme.colors.text.secondary, textAlign: 'center' }}>Returning</Text>
          </View>
          <View style={[styles.statBoxLine, { borderColor: theme.colors.border }]}>
            <Text style={{ fontSize: 18, fontFamily: theme.typography.family.bold, color: theme.colors.primary }}>{formatCurrency(data.avgBasketSize)}</Text>
            <Text style={{ fontSize: 11, color: theme.colors.text.secondary, textAlign: 'center' }}>Avg Basket</Text>
          </View>
       </View>

       <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Customer Segments</Text>
       <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
         {segments.map((seg, i) => (
           <LiquidPanel dark={isDark} key={i} style={[styles.box, { backgroundColor: seg.bg, width: layout.cardWidth }]}>
              <Text style={{ color: seg.col, fontFamily: theme.typography.family.bold, fontSize: 28 }}>{seg.count}</Text>
              <Text style={{ color: seg.col, fontFamily: theme.typography.family.semiBold, marginTop: 4 }}>{seg.label}</Text>
              <Text style={{ color: seg.col, fontSize: 11, opacity: 0.8 }}>{seg.sub}</Text>
           </LiquidPanel>
         ))}
       </View>

       <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Top 5 Customers</Text>
       <LiquidPanel dark={isDark} style={[styles.chartCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
          {topCustomers.length === 0 ? (
            <Text style={{ color: theme.colors.text.tertiary, textAlign: 'center', padding: 16 }}>No customer data yet.</Text>
          ) : topCustomers.map((cust, idx) => (
             <View key={cust.customerId} style={[styles.custRow, idx !== topCustomers.length -1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}>
                <View style={[styles.avatarSm, { backgroundColor: theme.colors.primaryLight }]}>
                  <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.bold }}>{getInitials(cust.name)}</Text>
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>{cust.name}</Text>
                  <Text style={{ fontSize: 11, color: theme.colors.text.tertiary, marginTop: 4 }}>Score: {cust.importanceScore}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: theme.typography.family.bold, color: theme.colors.primary }}>{formatCurrency(cust.totalSpent)}</Text>
                  <Text style={{ fontSize: 11, color: theme.colors.text.tertiary }}>{cust.totalPurchases} orders</Text>
                </View>
             </View>
          ))}
       </LiquidPanel>
    </ScrollView>
  );
}

function TaxTab({ from, to }: { from: string, to: string }) {
  const { theme, isDark } = useTheme();
  const layout = useReportLayout();
  const { data: gstSales, isLoading: isLoadingGst } = useGstSales(from, to);
  const { data: h1Data, isLoading: isLoadingH1 } = useScheduleH1(from, to);
  const addToast = useUIStore(s => s.addToast);

  const exportCSV = async (type: 'GSTR1' | 'H1') => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      let csvString = '';
      if (type === 'GSTR1') {
        const header = 'GST Rate,Taxable,CGST,SGST,Gross\n';
        const rows = (gstSales ?? []).map(s =>
          `${s.date},${s.taxableAmount},${s.cgst},${s.sgst},${s.total}`
        ).join('\n');
        csvString = header + rows;
      } else {
        const header = 'Date,Medicine,Customer,Batch,Qty\n';
        const rows = (h1Data ?? []).map(h =>
          `${h.date},${h.medicineName},${h.customerName},${h.prescriptionRef},${h.quantity}`
        ).join('\n');
        csvString = header + rows;
      }

      if (!csvString.trim() || csvString.split('\n').length <= 1) {
        addToast('No data to export for this period', 'error');
        return;
      }
        
      const fileUri = `${(FileSystem as any).documentDirectory}${type}_Export_${Date.now()}.csv`;
      await (FileSystem as any).writeAsStringAsync(fileUri, csvString);
      await Sharing.shareAsync(fileUri);
    } catch {
      addToast('Failed to export CSV', 'error');
    }
  };

  if (isLoadingGst || isLoadingH1) return <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} size="large" />;

  const slabs = (gstSales ?? []).map(s => ({
    rate: s.date,
    taxable: s.taxableAmount,
    cgst: s.cgst,
    sgst: s.sgst,
    total: s.total,
  }));
  const tTax = slabs.reduce((a,b)=>a+b.taxable,0);
  const tCgst = slabs.reduce((a,b)=>a+b.cgst,0);
  const tSgst = slabs.reduce((a,b)=>a+b.sgst,0);
  const tTot = slabs.reduce((a,b)=>a+b.total,0);

  return (
    <ScrollView contentContainerStyle={layout.scrollStyle}>
       <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>GST Summary (Sales)</Text>
          <TouchableOpacity style={[styles.exportMiniBtn, { backgroundColor: theme.colors.primaryLight }]} onPress={() => exportCSV('GSTR1')}>
             <Ionicons name="download-outline" size={14} color={theme.colors.primary} />
             <Text style={{ color: theme.colors.primary, fontSize: 12, fontFamily: theme.typography.family.semiBold, marginLeft: 4 }}>Export GSTR-1</Text>
          </TouchableOpacity>
       </View>

       <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingBottom: 6 }}>
       <LiquidPanel dark={isDark} style={[styles.chartCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card, padding: 0, overflow: 'hidden', width: layout.tableWidth }]}>
         <View style={{ flexDirection: 'row', backgroundColor: theme.colors.background, padding: 12 }}>
            <Text style={[styles.th, { color: theme.colors.text.secondary, flex: 0.6 }]}>Rate</Text>
            <Text style={[styles.th, { color: theme.colors.text.secondary, flex: 1.2, textAlign: 'right' }]}>Taxable</Text>
            <Text style={[styles.th, { color: theme.colors.text.secondary, flex: 1, textAlign: 'right' }]}>CGST</Text>
            <Text style={[styles.th, { color: theme.colors.text.secondary, flex: 1, textAlign: 'right' }]}>SGST</Text>
            <Text style={[styles.th, { color: theme.colors.text.secondary, flex: 1.2, textAlign: 'right' }]}>Gross</Text>
         </View>
         {slabs.length === 0 ? (
           <Text style={{ color: theme.colors.text.tertiary, textAlign: 'center', padding: 16 }}>No GST sales in this period.</Text>
         ) : slabs.map((slab, i) => (
           <View key={i} style={{ flexDirection: 'row', padding: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.border }}>
             <Text style={[styles.td, { color: theme.colors.text.primary, flex: 0.6, fontFamily: theme.typography.family.semiBold }]}>{slab.rate}</Text>
             <Text style={[styles.td, { color: theme.colors.text.primary, flex: 1.2, textAlign: 'right' }]}>{formatCurrency(slab.taxable)}</Text>
             <Text style={[styles.td, { flex: 1, textAlign: 'right', color: theme.colors.text.tertiary }]}>{formatCurrency(slab.cgst)}</Text>
             <Text style={[styles.td, { flex: 1, textAlign: 'right', color: theme.colors.text.tertiary }]}>{formatCurrency(slab.sgst)}</Text>
             <Text style={[styles.td, { color: theme.colors.text.primary, flex: 1.2, textAlign: 'right', fontFamily: theme.typography.family.medium }]}>{formatCurrency(slab.total)}</Text>
           </View>
         ))}
         {slabs.length > 0 && (
         <View style={{ flexDirection: 'row', padding: 12, backgroundColor: theme.colors.primaryLight }}>
             <Text style={[styles.td, { flex: 0.6, fontFamily: theme.typography.family.bold, color: theme.colors.primary }]}>Total</Text>
             <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontFamily: theme.typography.family.bold, color: theme.colors.primary }]}>{formatCurrency(tTax)}</Text>
             <Text style={[styles.td, { flex: 1, textAlign: 'right', fontFamily: theme.typography.family.bold, color: theme.colors.primary }]}>{formatCurrency(tCgst)}</Text>
             <Text style={[styles.td, { flex: 1, textAlign: 'right', fontFamily: theme.typography.family.bold, color: theme.colors.primary }]}>{formatCurrency(tSgst)}</Text>
             <Text style={[styles.td, { flex: 1.2, textAlign: 'right', fontFamily: theme.typography.family.bold, color: theme.colors.primary }]}>{formatCurrency(tTot)}</Text>
         </View>
         )}
       </LiquidPanel>
       </ScrollView>

       <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, marginTop: 32 }}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text.primary }]}>Schedule H1 Register</Text>
          <TouchableOpacity style={[styles.exportMiniBtn, { backgroundColor: theme.colors.primaryLight }]} onPress={() => exportCSV('H1')}>
             <Ionicons name="download-outline" size={14} color={theme.colors.primary} />
             <Text style={{ color: theme.colors.primary, fontSize: 12, fontFamily: theme.typography.family.semiBold, marginLeft: 4 }}>CSV</Text>
          </TouchableOpacity>
       </View>

       <LiquidPanel dark={isDark} style={[styles.chartCard, { backgroundColor: theme.colors.surface, ...theme.shadow.card }]}>
          {h1Data && h1Data.length > 0 ? h1Data.map((h1, idx) => (
             <View key={h1.saleId} style={[styles.custRow, idx !== h1Data.length -1 && { borderBottomWidth: 1, borderBottomColor: theme.colors.border }]}>
               <View style={{ flex: 1 }}>
                 <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.danger }}>{h1.medicineName}</Text>
                 <Text style={{ fontSize: 12, color: theme.colors.text.secondary }}>{h1.customerName} • {formatDate(h1.date)}</Text>
               </View>
               <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontFamily: theme.typography.family.bold }}>{h1.quantity} units</Text>
               </View>
             </View>
          )) : <Text style={{ color: theme.colors.text.tertiary, textAlign: 'center', padding: 16 }}>No Schedule H1 sales found in period.</Text>}
       </LiquidPanel>
    </ScrollView>
  );
}

// ─── MAIN SCREEN ─────────────────────────────────────────────────────────────

export default function ReportsIndexScreen() {
  const { theme, isDark } = useTheme();
  const layout = useReportLayout();
  const insets = useSafeAreaInsets();
  
  const [activeTab, setActiveTab] = useState(0);
  // Demo standard dates (beginning of month to now)
  const [from] = useState(new Date(new Date().setDate(1)).toISOString());
  const [to] = useState(new Date().toISOString());

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <GlassMeshBackground />
       <WorkspaceHeader title="Reports" icon="bar-chart-outline" subtitle="This month · sales, stock and tax" onBack={() => router.canGoBack() ? router.back() : router.navigate('/(app)/(tabs)/dashboard')} />

       <View style={[styles.tabBar, { backgroundColor: theme.colors.background }]}>
         <ScrollView horizontal style={{ width: '100%', flexGrow: 0 }} showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 8 }}>
           {TABS.map((t, i) => <WorkspaceChip key={t} label={t} role="tab" selected={activeTab === i} onPress={() => { void Haptics.selectionAsync().catch(() => {}); setActiveTab(i); }} />)}
         </ScrollView>
       </View>

       <View style={styles.body}>
          {activeTab === 0 && <OverviewTab from={from} to={to} />}
          {activeTab === 1 && <ProductsTab from={from} to={to} />}
          {activeTab === 2 && <CustomersTab />}
          {activeTab === 3 && <TaxTab from={from} to={to} />}
       </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 12 },
  headerTitle: { fontSize: 24 },
  datePill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16 },
  tabBar: { borderBottomWidth: 1, borderBottomColor: '#E4E9F2', alignItems: 'stretch', overflow: 'hidden' },
  tabBtn: { minHeight: 44, paddingVertical: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: 8, borderWidth: 1 },
  indicator: { position: 'absolute', bottom: 0, left: 0, height: 3, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  body: { flex: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 12 },
  box: { padding: 16, borderRadius: 16 },
  chartCard: { padding: 16, borderRadius: 16, marginBottom: 16 },
  rankCirle: { width: 28, height: 28, borderRadius: 16, borderWidth: 2, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  statBoxLine: { flex: 1, height: 64, borderWidth: 1, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  avatarSm: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  custRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  exportMiniBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  th: { fontSize: 12, color: '#64748B', fontWeight: 'bold' },
  td: { fontSize: 13, color: '#0D1B2A' }
});
