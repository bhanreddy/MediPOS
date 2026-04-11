import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { useDebounce } from '../../../hooks/useDebounce';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { SearchBar } from '../../../components/ui/SearchBar';

export default function CustomersListScreen() {
  const { user } = useSessionStore();
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 400);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['customers', user?.clinic_id, debouncedSearch],
    queryFn: () => api.get('/customers', { params: { q: debouncedSearch || undefined } }).then(r => r.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.data?.length && !debouncedSearch) return (
    <EmptyState message="No customers yet" actionLabel="+ Add Customer" onAction={() => router.push('/(app)/customers/new')} icon="people-outline" />
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <SearchBar value={searchText} onChangeText={setSearchText} placeholder="Search by name or phone..." />
      <FlatList
        data={data?.data || []}
        keyExtractor={(item: any) => item.id}
        ListEmptyComponent={<Text style={{ color: theme.text.muted, textAlign: 'center', padding: 20 }}>No results</Text>}
        renderItem={({ item }: { item: any }) => (
          <Card onPress={() => router.push({ pathname: '/(app)/customers/[id]', params: { id: item.id } })} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text.primary, fontWeight: '700' }}>{item.name}</Text>
                {item.phone && <Text style={{ color: theme.text.muted, fontSize: 12 }}>{item.phone}</Text>}
                {/* Importance bar */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <View style={{ height: 4, flex: 1, backgroundColor: theme.bg.surface, borderRadius: 2, marginRight: 8 }}>
                    <View style={{ height: 4, borderRadius: 2, width: `${item.importance_score || 0}%`, backgroundColor: (item.importance_score || 0) > 70 ? theme.status.success : (item.importance_score || 0) > 40 ? theme.status.warning : theme.text.muted }} />
                  </View>
                  <Text style={{ color: theme.text.muted, fontSize: 11 }}>{item.importance_score || 0}</Text>
                </View>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                {Number(item.outstanding_balance) > 0 && (
                  <Text style={{ color: theme.status.error, fontWeight: '700', fontSize: 14 }}>₹{Number(item.outstanding_balance).toLocaleString('en-IN')}</Text>
                )}
              </View>
            </View>
          </Card>
        )}
      />
      <TouchableOpacity onPress={() => router.push('/(app)/customers/new')}
        style={{ position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.accent.primary, justifyContent: 'center', alignItems: 'center', elevation: 6 }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
