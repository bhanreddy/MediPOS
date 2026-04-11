import { View, Text, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { theme } from '../../../../constants/theme';
import { api } from '../../../../lib/api';
import { useSessionStore } from '../../../../store/sessionStore';
import { LoadingScreen } from '../../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../../components/ui/ErrorScreen';
import { Card } from '../../../../components/ui/Card';
import { KPICard } from '../../../../components/ui/KPICard';
import { StatRow } from '../../../../components/ui/StatRow';
import { DateRangePicker } from '../../../../components/ui/DateRangePicker';

export default function AccountingScreen() {
  const { user } = useSessionStore();
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['accounting_summary', user?.clinic_id, dateRange],
    queryFn: () => api.get('/accounting/summary', {
      params: { from: format(dateRange.from, 'yyyy-MM-dd'), to: format(dateRange.to, 'yyyy-MM-dd') }
    }).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const d = data || {};
  const cashPositive = (d.net_cash_position || 0) >= 0;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />

      {/* Net Cash Position */}
      <Card style={{ marginBottom: 16, alignItems: 'center' as any, paddingVertical: 24 }}>
        <Text style={{ color: theme.text.muted, fontSize: 12, marginBottom: 4 }}>NET CASH POSITION</Text>
        <Text style={{ color: cashPositive ? theme.status.success : theme.status.error, fontSize: 36, fontWeight: '900' }}>
          ₹{(d.net_cash_position || 0).toLocaleString('en-IN')}
        </Text>
      </Card>

      {/* P&L Summary */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <KPICard label="Net Revenue" value={`₹${(d.net_revenue || 0).toLocaleString('en-IN')}`} icon="cash-outline" accentColor={theme.status.success} />
        <KPICard label="Net Profit" value={`₹${(d.net_profit || 0).toLocaleString('en-IN')}`} icon="trending-up-outline" accentColor={(d.net_profit || 0) >= 0 ? theme.status.success : theme.status.error} />
      </View>

      {/* Breakdown */}
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 8 }}>Revenue & Costs</Text>
        <StatRow label="Gross Revenue" value={`₹${(d.gross_revenue || 0).toLocaleString('en-IN')}`} />
        <StatRow label="Returns" value={`-₹${(d.total_returns || 0).toLocaleString('en-IN')}`} valueColor={theme.status.error} />
        <StatRow label="COGS" value={`-₹${(d.cogs || 0).toLocaleString('en-IN')}`} />
        <StatRow label="Gross Profit" value={`₹${(d.gross_profit || 0).toLocaleString('en-IN')}`} valueColor={theme.status.success} />
        <StatRow label="Margin %" value={`${(d.gross_margin_pct || 0).toFixed(1)}%`} />
      </Card>

      {/* Expenses */}
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 8 }}>Expenses</Text>
        {d.total_expenses?.by_category?.map((cat: any) => (
          <StatRow key={cat.category} label={cat.category} value={`₹${cat.amount.toLocaleString('en-IN')}`} />
        ))}
        <View style={{ marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)' }}>
          <StatRow label="Total Expenses" value={`₹${(d.total_expenses?.total || 0).toLocaleString('en-IN')}`} valueColor={theme.status.error} />
        </View>
      </Card>

      {/* Outstanding */}
      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <Card style={{ flex: 1, alignItems: 'center' as any }}>
          <Text style={{ color: theme.status.success, fontSize: 20, fontWeight: '800' }}>₹{(d.outstanding_receivable || 0).toLocaleString('en-IN')}</Text>
          <Text style={{ color: theme.text.muted, fontSize: 11, marginTop: 4 }}>Receivable</Text>
        </Card>
        <Card style={{ flex: 1, alignItems: 'center' as any }}>
          <Text style={{ color: theme.status.error, fontSize: 20, fontWeight: '800' }}>₹{(d.outstanding_payable || 0).toLocaleString('en-IN')}</Text>
          <Text style={{ color: theme.text.muted, fontSize: 11, marginTop: 4 }}>Payable</Text>
        </Card>
      </View>
    </ScrollView>
  );
}
