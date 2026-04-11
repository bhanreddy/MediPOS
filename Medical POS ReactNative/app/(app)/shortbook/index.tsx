import { View, Text, FlatList, TouchableOpacity, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { useRole } from '../../../hooks/useRole';
import { useDebounce } from '../../../hooks/useDebounce';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchBar } from '../../../components/ui/SearchBar';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { toast } from '../../../lib/toast';

export default function ShortbookScreen() {
  const { user } = useSessionStore();
  const { isOwner } = useRole();
  const queryClient = useQueryClient();
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [medSearch, setMedSearch] = useState('');
  const debouncedMed = useDebounce(medSearch, 400);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['shortbook', user?.clinic_id],
    queryFn: () => api.get('/shortbook').then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  const { data: medResults } = useQuery({
    queryKey: ['med_search_sb', debouncedMed],
    queryFn: () => api.get('/inventory/medicines', { params: { q: debouncedMed } }).then(r => r.data.data),
    enabled: debouncedMed.length >= 2,
  });

  const markOrderedMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/shortbook/${id}/ordered`).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shortbook'] }); toast.success('Marked as ordered'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/shortbook/${id}`).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shortbook'] }); toast.info('Removed from shortbook'); },
  });

  const addMutation = useMutation({
    mutationFn: (payload: any) => api.post('/shortbook', payload).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['shortbook'] }); setShowAddSheet(false); toast.success('Added to shortbook'); },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed'),
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;
  if (!data?.length) return (
    <EmptyState message="Shortbook is empty" subMessage="Medicines that need reordering will appear here" icon="clipboard-outline" actionLabel="+ Add" onAction={() => setShowAddSheet(true)} />
  );

  const reasonVariant = (r: string) => {
    if (r === 'low_stock') return 'danger' as const;
    if (r === 'expired') return 'warning' as const;
    return 'info' as const;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <FlatList
        data={data}
        keyExtractor={(item: any) => item.id}
        renderItem={({ item }: { item: any }) => (
          <Card style={{ marginBottom: 10 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text.primary, fontWeight: '700' }}>{item.medicines?.name || 'Medicine'}</Text>
                <Badge label={item.reason || 'manual'} variant={reasonVariant(item.reason)} style={{ marginTop: 4 }} />
                <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 4 }}>Qty Needed: {item.qty_needed || '-'}</Text>
              </View>
              <View style={{ gap: 6 }}>
                {isOwner && (
                  <Button label="Ordered" variant="ghost" onPress={() => markOrderedMutation.mutate(item.id)} />
                )}
                <TouchableOpacity onPress={() => Alert.alert('Remove?', 'Remove from shortbook?', [{ text: 'Cancel' }, { text: 'Remove', style: 'destructive', onPress: () => deleteMutation.mutate(item.id) }])}>
                  <Ionicons name="trash-outline" size={20} color={theme.status.error} />
                </TouchableOpacity>
              </View>
            </View>
          </Card>
        )}
      />

      {/* FAB */}
      <TouchableOpacity onPress={() => setShowAddSheet(true)}
        style={{ position: 'absolute', bottom: 20, right: 20, width: 56, height: 56, borderRadius: 28, backgroundColor: theme.accent.primary, justifyContent: 'center', alignItems: 'center', elevation: 6 }}>
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {/* Add sheet */}
      <BottomSheet visible={showAddSheet} onClose={() => setShowAddSheet(false)} title="Add to Shortbook">
        <SearchBar value={medSearch} onChangeText={setMedSearch} placeholder="Search medicine..." />
        {medResults?.map((m: any) => (
          <TouchableOpacity key={m.id} onPress={() => addMutation.mutate({ medicine_id: m.id, reason: 'manual', qty_needed: m.low_stock_threshold })}
            style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
            <Text style={{ color: theme.text.primary }}>{m.name}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>{m.generic_name || ''}</Text>
          </TouchableOpacity>
        ))}
      </BottomSheet>
    </View>
  );
}
