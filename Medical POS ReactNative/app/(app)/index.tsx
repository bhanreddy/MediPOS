import { View, Text, ScrollView, TouchableOpacity, FlatList, Dimensions } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { LineChart } from 'react-native-chart-kit';
import { theme } from '../../constants/theme';
import { reportsApi } from '../../lib/api';
import { useSessionStore } from '../../store/sessionStore';
import { useAlerts } from '../../hooks/useAlerts';
import { LoadingScreen } from '../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../components/ui/ErrorScreen';
import { KPICard } from '../../components/ui/KPICard';
import { Card } from '../../components/ui/Card';

const screenWidth = Dimensions.get('window').width;

export default function DashboardScreen() {
  const { user } = useSessionStore();
  const { lowStockCount, expiryCount, shortbookCount, totalAlerts } = useAlerts();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['dashboard', user?.clinic_id],
    queryFn: () => reportsApi.getDashboard().then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const greeting = new Date().getHours() < 12 ? 'Good Morning' : new Date().getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

  const chartLabels = data?.daily_chart?.map((d: any) => format(new Date(d.date), 'EEE')) || [];
  const chartValues = data?.daily_chart?.map((d: any) => d.revenue) || [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bg.primary }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 16 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <View>
            <Text style={{ color: theme.text.primary, fontSize: 22, fontWeight: '800' }}>{greeting},</Text>
            <Text style={{ color: theme.accent.primary, fontSize: 16, fontWeight: '600', marginTop: 2 }}>{user?.email?.split('@')[0]}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 4 }}>{format(new Date(), 'EEEE, dd MMMM yyyy')}</Text>
          </View>
          <TouchableOpacity
            onPress={() => router.push('/(app)/alerts/low-stock')}
            style={{ position: 'relative', padding: 8 }}
          >
            <Ionicons name="notifications-outline" size={26} color={theme.text.primary} />
            {totalAlerts > 0 && (
              <View style={{
                position: 'absolute', top: 4, right: 4,
                backgroundColor: theme.status.error, borderRadius: 10,
                minWidth: 18, height: 18, justifyContent: 'center', alignItems: 'center',
              }}>
                <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>{totalAlerts}</Text>
              </View>
            )}
          </TouchableOpacity>
        </View>

        {/* Revenue KPIs */}
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <KPICard
            label="Today's Revenue"
            value={`₹${(data?.today_revenue || 0).toLocaleString('en-IN')}`}
            icon="cash-outline"
            accentColor={theme.accent.primary}
          />
          <KPICard
            label="Today's Bills"
            value={String(data?.today_bills || 0)}
            icon="receipt-outline"
            accentColor={theme.accent.secondary}
          />
        </View>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          <KPICard
            label="Week Revenue"
            value={`₹${(data?.week_revenue || 0).toLocaleString('en-IN')}`}
            icon="trending-up-outline"
            accentColor={theme.status.success}
          />
          <KPICard
            label="Outstanding"
            value={`₹${(data?.outstanding_receivable || 0).toLocaleString('en-IN')}`}
            icon="wallet-outline"
            accentColor={theme.status.warning}
          />
        </View>

        {/* Alert Cards */}
        <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Alerts</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 20 }}>
          <Card onPress={() => router.push('/(app)/alerts/low-stock')} style={{ marginRight: 12, minWidth: 160 }}>
            <Ionicons name="warning-outline" size={24} color={theme.status.error} />
            <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginTop: 8 }}>Low Stock</Text>
            <Text style={{ color: theme.text.muted, fontSize: 13, marginTop: 2 }}>{lowStockCount} medicines</Text>
          </Card>
          <Card onPress={() => router.push('/(app)/alerts/expiry')} style={{ marginRight: 12, minWidth: 160 }}>
            <Ionicons name="time-outline" size={24} color={theme.status.warning} />
            <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginTop: 8 }}>Expiring</Text>
            <Text style={{ color: theme.text.muted, fontSize: 13, marginTop: 2 }}>{expiryCount} batches</Text>
          </Card>
          <Card onPress={() => router.push('/(app)/shortbook')} style={{ marginRight: 12, minWidth: 160 }}>
            <Ionicons name="clipboard-outline" size={24} color={theme.accent.secondary} />
            <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginTop: 8 }}>Shortbook</Text>
            <Text style={{ color: theme.text.muted, fontSize: 13, marginTop: 2 }}>{shortbookCount} items</Text>
          </Card>
        </ScrollView>

        {/* Weekly Sales Chart */}
        {chartLabels.length > 0 && chartValues.some((v: number) => v > 0) && (
          <View style={{ marginBottom: 20 }}>
            <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Weekly Sales</Text>
            <Card>
              <LineChart
                data={{
                  labels: chartLabels,
                  datasets: [{ data: chartValues.length > 0 ? chartValues : [0] }],
                }}
                width={screenWidth - 80}
                height={180}
                yAxisLabel="₹"
                yAxisSuffix=""
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: theme.bg.card,
                  backgroundGradientTo: theme.bg.card,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(0, 201, 167, ${opacity})`,
                  labelColor: () => theme.text.muted,
                  propsForDots: { r: '4', strokeWidth: '2', stroke: theme.accent.primary },
                }}
                bezier
                style={{ borderRadius: theme.radius.sm }}
              />
            </Card>
          </View>
        )}

        {/* Quick Actions */}
        <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Quick Actions</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
          {[
            { label: '+ New Sale', icon: 'add-circle-outline' as const, route: '/(app)/billing/new', color: theme.accent.primary },
            { label: '+ New Purchase', icon: 'cart-outline' as const, route: '/(app)/purchases/new', color: theme.accent.secondary },
            { label: 'Scan Bill', icon: 'scan-outline' as const, route: '/(app)/purchases/scan-bill', color: theme.status.warning },
            { label: 'View Reports', icon: 'bar-chart-outline' as const, route: '/(app)/reports', color: theme.status.success },
          ].map((action) => (
            <TouchableOpacity
              key={action.label}
              onPress={() => router.push(action.route as any)}
              style={{
                width: (screenWidth - 44) / 2,
                backgroundColor: theme.bg.card,
                borderRadius: theme.radius.md,
                padding: 16,
                flexDirection: 'row',
                alignItems: 'center',
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.05)',
              }}
            >
              <Ionicons name={action.icon} size={22} color={action.color} style={{ marginRight: 10 }} />
              <Text style={{ color: theme.text.primary, fontSize: 14, fontWeight: '600' }}>{action.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
