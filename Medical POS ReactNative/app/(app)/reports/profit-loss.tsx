import { View, Text, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { theme } from '../../../constants/theme';
import { reportsApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { Card } from '../../../components/ui/Card';
import { KPICard } from '../../../components/ui/KPICard';
import { StatRow } from '../../../components/ui/StatRow';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';

export default function ProfitLossScreen() {
  const { user } = useSessionStore();
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['profit_loss', user?.clinic_id, dateRange],
    queryFn: () => reportsApi.getProfitLoss(format(dateRange.from, 'yyyy-MM-dd'), format(dateRange.to, 'yyyy-MM-dd')).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const pl = data || {};
  const isProfit = (pl.net_profit || 0) >= 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <KPICard label="Gross Revenue" value={`₹${(pl.gross_revenue || 0).toLocaleString('en-IN')}`} icon="cash-outline" accentColor={theme.status.success} />
        <KPICard label="COGS" value={`₹${(pl.cogs || 0).toLocaleString('en-IN')}`} icon="cart-outline" accentColor={theme.accent.secondary} />
      </View>
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <KPICard label="Gross Profit" value={`₹${(pl.gross_profit || 0).toLocaleString('en-IN')}`} icon="trending-up-outline" accentColor={theme.accent.primary} />
        <KPICard label="Margin %" value={`${(pl.gross_margin_pct || 0).toFixed(1)}%`} icon="analytics-outline" accentColor={theme.status.warning} />
      </View>

      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 8 }}>Breakdown</Text>
        <StatRow label="Gross Revenue" value={`₹${(pl.gross_revenue || 0).toLocaleString('en-IN')}`} />
        <StatRow label="Returns" value={`-₹${(pl.total_returns || 0).toLocaleString('en-IN')}`} valueColor={theme.status.error} />
        <StatRow label="Net Revenue" value={`₹${(pl.net_revenue || 0).toLocaleString('en-IN')}`} />
        <StatRow label="COGS" value={`-₹${(pl.cogs || 0).toLocaleString('en-IN')}`} />
        <StatRow label="Gross Profit" value={`₹${(pl.gross_profit || 0).toLocaleString('en-IN')}`} valueColor={theme.status.success} />
        <StatRow label="Total Expenses" value={`-₹${(pl.total_expenses || 0).toLocaleString('en-IN')}`} />
        <View style={{ marginTop: 8, paddingTop: 8, borderTopWidth: 2, borderTopColor: 'rgba(255,255,255,0.1)' }}>
          <StatRow label="Net Profit" value={`₹${(pl.net_profit || 0).toLocaleString('en-IN')}`} valueColor={isProfit ? theme.status.success : theme.status.error} />
        </View>
      </Card>
    </ScrollView>
  );
}
