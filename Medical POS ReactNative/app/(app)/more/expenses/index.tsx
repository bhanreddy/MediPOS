import { View, Text, FlatList, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../../constants/theme';
import { api } from '../../../../lib/api';
import { useSessionStore } from '../../../../store/sessionStore';
import { useRole } from '../../../../hooks/useRole';
import { LoadingScreen } from '../../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Card } from '../../../../components/ui/Card';
import { Badge } from '../../../../components/ui/Badge';
import { BottomSheet } from '../../../../components/ui/BottomSheet';
import { DateRangePicker } from '../../../../components/ui/DateRangePicker';
import { Button } from '../../../../components/ui/Button';
import { toast } from '../../../../lib/toast';

const CATEGORIES = ['rent', 'salary', 'utilities', 'supplies', 'maintenance', 'misc'];

export default function ExpensesListScreen() {
  const { user } = useSessionStore();
  const { isOwner } = useRole();
  const queryClient = useQueryClient();
  const [selectedCategory, setSelectedCategory] = useState<string | undefined>();
  const [showFilters, setShowFilters] = useState(false);
  const [dateRange, setDateRange] = useState({ from: new Date(Date.now() - 30 * 86400000), to: new Date() });

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['expenses', user?.clinic_id, selectedCategory, dateRange],
    queryFn: () => api.get('/expenses', {
      params: { category: selectedCategory, from: format(dateRange.from, 'yyyy-MM-dd'), to: format(dateRange.to, 'yyyy-MM-dd') }
    }).then(r => r.data),
    enabled: !!user?.clinic_id,
  });

  const { data: summaryData } = useQuery({
    queryKey: ['expenses_summary', user?.clinic_id, dateRange],
    queryFn: () => api.get('/expenses/summary', {
      params: { from: format(dateRange.from, 'yyyy-MM-dd'), to: format(dateRange.to, 'yyyy-MM-dd') }
    }).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/expenses/${id}`).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.info('Expense deleted'); },
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.data?.length) return (
    <EmptyState message="No expenses recorded" actionLabel="+ Add Expense" onAction={() => router.push('/(app)/more/expenses/new' as any)} icon="card-outline" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
      {/* Category summary */}
      {summaryData?.summary && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxHeight: 70, paddingHorizontal: 16, paddingTop: 12 }}>
          {summaryData.summary.map((s: any) => (
            <TouchableOpacity key={s.category} onPress={() => setSelectedCategory(selectedCategory === s.category ? undefined : s.category)}
              style={{ backgroundColor: selectedCategory === s.category ? theme.accent.primary : theme.bg.card, borderRadius: theme.radius.sm, padding: 12, marginRight: 8, minWidth: 100 }}>
              <Text style={{ color: selectedCategory === s.category ? '#fff' : theme.text.primary, fontWeight: '700', textTransform: 'capitalize' }}>{s.category}</Text>
              <Text style={{ color: selectedCategory === s.category ? 'rgba(255,255,255,0.7)' : theme.text.muted, fontSize: 12 }}>₹{s.total.toLocaleString('en-IN')}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      <View style={{ padding: 16, flex: 1 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ color: theme.text.muted, fontSize: 13 }}>Total: ₹{summaryData?.grand_total?.toLocaleString('en-IN') || '0'}</Text>
          <TouchableOpacity onPress={() => setShowFilters(true)}>
            <Ionicons name="filter-outline" size={20} color={theme.accent.primary} />
          </TouchableOpacity>
        </View>

        <FlatList data={data.data} keyExtractor={(i: any) => i.id} renderItem={({ item }: { item: any }) => (
          <Card style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Badge label={item.category} variant="muted" />
                  <Text style={{ color: theme.text.primary, fontWeight: '600' }}>₹{Number(item.amount).toLocaleString('en-IN')}</Text>
                </View>
                {item.description && <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 4 }}>{item.description}</Text>}
                <Text style={{ color: theme.text.muted, fontSize: 11, marginTop: 2 }}>{format(new Date(item.expense_date), 'dd MMM yyyy')} • {item.payment_mode}</Text>
              </View>
              {isOwner && (
                <TouchableOpacity onPress={() => Alert.alert('Delete', 'Delete this expense?', [{ text: 'Cancel' }, { text: 'Delete', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) }])}>
                  <Ionicons name="trash-outline" size={20} color={theme.status.error} />
                </TouchableOpacity>
              )}
            </View>
          </Card>
        )} />
      </View>

      <TouchableOpacity onPress={() => router.push('/(app)/more/expenses/new' as any)}
        style={{ position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.accent.primary, justifyContent: 'center', alignItems: 'center', elevation: 6 }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      <BottomSheet visible={showFilters} onClose={() => setShowFilters(false)} title="Date Range">
        <DateRangePicker from={dateRange.from} to={dateRange.to} onChange={setDateRange} />
        <Button label="Apply" onPress={() => { setShowFilters(false); refetch(); }} fullWidth />
      </BottomSheet>
    </View>
  );
}
