import { View, Text, ScrollView, Dimensions } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { Card } from '../../../components/ui/Card';
import { DateRangePicker } from '../../../components/ui/DateRangePicker';

const screenWidth = Dimensions.get('window').width;

const reportCards = [
  { label: 'GST Sales Register', icon: 'document-text-outline', route: '/(app)/reports/gst', color: theme.accent.primary },
  { label: 'GST Purchase Register', icon: 'receipt-outline', route: '/(app)/reports/gst?type=purchase', color: theme.accent.secondary },
  { label: 'Schedule H1 Report', icon: 'medkit-outline', route: '/(app)/reports/schedule-h1', color: theme.status.warning },
  { label: 'Product-wise Statement', icon: 'cube-outline', route: '/(app)/reports/product-wise', color: theme.status.success },
  { label: 'Profit & Loss', icon: 'trending-up-outline', route: '/(app)/reports/profit-loss', color: theme.accent.primary },
  { label: 'Expiry Report', icon: 'time-outline', route: '/(app)/reports/expiry-report', color: theme.status.error },
];

export default function ReportsHubScreen() {
  const [dateRange, setDateRange] = useState({ from: subDays(new Date(), 30), to: new Date() });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: theme.text.primary, fontSize: 20, fontWeight: '800', marginBottom: 16 }}>Reports</Text>

      <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {reportCards.map((r) => (
          <Card key={r.label} onPress={() => router.push(r.route as any)} style={{ width: (screenWidth - 44) / 2 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: `${r.color}22`, justifyContent: 'center', alignItems: 'center', marginBottom: 10 }}>
              <Ionicons name={r.icon as any} size={24} color={r.color} />
            </View>
            <Text style={{ color: theme.text.primary, fontWeight: '600', fontSize: 14 }}>{r.label}</Text>
          </Card>
        ))}
      </View>
    </ScrollView>
  );
}
