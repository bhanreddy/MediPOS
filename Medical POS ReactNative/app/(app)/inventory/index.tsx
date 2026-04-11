import { View, Text, FlatList, TouchableOpacity } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { inventoryApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { useDebounce } from '../../../hooks/useDebounce';
import { useRole } from '../../../hooks/useRole';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { SearchBar } from '../../../components/ui/SearchBar';

const CATEGORIES = ['All', 'tablet', 'syrup', 'injection', 'capsule', 'cream', 'drops', 'other'];

export default function InventoryListScreen() {
  const { user } = useSessionStore();
  const { isOwner } = useRole();
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 400);
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [lowStockOnly, setLowStockOnly] = useState(false);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['medicines', user?.clinic_id, debouncedSearch, selectedCategory, lowStockOnly],
    queryFn: () => inventoryApi.getMedicines({
      q: debouncedSearch || undefined,
      category: selectedCategory !== 'All' ? selectedCategory : undefined,
      low_stock: lowStockOnly ? 'true' : undefined,
    }).then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  const getStockColor = (stock: number, threshold: number) => {
    if (stock <= threshold) return theme.status.error;
    if (stock <= threshold * 2) return theme.status.warning;
    return theme.status.success;
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary, padding: 16 }}>
      <SearchBar value={searchText} onChangeText={setSearchText} placeholder="Search medicines..." />

      {/* Category chips */}
      <FlatList
        horizontal
        data={CATEGORIES}
        showsHorizontalScrollIndicator={false}
        style={{ maxHeight: 44, marginBottom: 12 }}
        keyExtractor={(item) => item}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setSelectedCategory(item)}
            style={{
              paddingHorizontal: 14, paddingVertical: 8, borderRadius: 18,
              backgroundColor: selectedCategory === item ? theme.accent.primary : theme.bg.card,
              marginRight: 8,
            }}
          >
            <Text style={{ color: selectedCategory === item ? '#fff' : theme.text.primary, fontSize: 12, fontWeight: '600', textTransform: 'capitalize' }}>{item}</Text>
          </TouchableOpacity>
        )}
      />

      {/* Low Stock toggle */}
      <TouchableOpacity onPress={() => setLowStockOnly(!lowStockOnly)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
        <Ionicons name={lowStockOnly ? 'checkbox' : 'square-outline'} size={20} color={theme.accent.primary} />
        <Text style={{ color: theme.text.primary, marginLeft: 6, fontSize: 13 }}>Low Stock Only</Text>
      </TouchableOpacity>

      {!data?.length ? (
        <EmptyState message="No medicines found" icon="medkit-outline" />
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item: any) => item.id}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }: { item: any }) => {
            const stock = item.medicine_stock?.[0]?.total_stock || 0;
            return (
              <Card onPress={() => router.push({ pathname: '/(app)/inventory/[id]', params: { id: item.id } })} style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 15 }}>{item.name}</Text>
                    {item.generic_name && <Text style={{ color: theme.text.muted, fontSize: 12 }}>{item.generic_name}</Text>}
                    {item.manufacturer && <Text style={{ color: theme.text.muted, fontSize: 11 }}>{item.manufacturer}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Badge label={item.category} variant="muted" />
                    <Text style={{
                      color: getStockColor(stock, item.low_stock_threshold),
                      fontWeight: '700', fontSize: 14, marginTop: 6,
                    }}>
                      Stock: {stock}
                    </Text>
                  </View>
                </View>
              </Card>
            );
          }}
        />
      )}

      {/* FAB */}
      {isOwner && (
        <TouchableOpacity
          onPress={() => router.push('/(app)/inventory/new')}
          style={{
            position: 'absolute', bottom: 20, right: 20,
            width: 56, height: 56, borderRadius: 28,
            backgroundColor: theme.accent.primary,
            justifyContent: 'center', alignItems: 'center', elevation: 6,
          }}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}
    </View>
  );
}
