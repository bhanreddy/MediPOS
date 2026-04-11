import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../../constants/theme';
import { api } from '../../../../lib/api';
import { useSessionStore } from '../../../../store/sessionStore';
import { LoadingScreen } from '../../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../../components/ui/EmptyState';
import { Card } from '../../../../components/ui/Card';

export default function SuppliersListScreen() {
  const { user } = useSessionStore();
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['suppliers', user?.clinic_id],
    queryFn: () => api.get('/suppliers').then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.length) return <EmptyState message="No suppliers yet" actionLabel="+ Add Supplier" onAction={() => router.push('/(app)/more/suppliers/new' as any)} icon="business-outline" />;

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <FlatList data={data} keyExtractor={(i: any) => i.id} renderItem={({ item }: { item: any }) => (
        <Card onPress={() => router.push({ pathname: '/(app)/more/suppliers/[id]' as any, params: { id: item.id } })} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <View>
              <Text style={{ color: theme.text.primary, fontWeight: '700' }}>{item.name}</Text>
              {item.phone && <Text style={{ color: theme.text.muted, fontSize: 12 }}>{item.phone}</Text>}
              {item.gstin && <Text style={{ color: theme.text.muted, fontSize: 11 }}>GSTIN: {item.gstin}</Text>}
            </View>
            {Number(item.outstanding_balance) > 0 && (
              <Text style={{ color: theme.status.error, fontWeight: '700' }}>₹{Number(item.outstanding_balance).toLocaleString('en-IN')}</Text>
            )}
          </View>
        </Card>
      )} />
      <TouchableOpacity onPress={() => router.push('/(app)/more/suppliers/new' as any)}
        style={{ position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.accent.primary, justifyContent: 'center', alignItems: 'center', elevation: 6 }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>
    </View>
  );
}
