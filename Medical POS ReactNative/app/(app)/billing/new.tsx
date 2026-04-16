import { View, Text, ScrollView, FlatList, TouchableOpacity, Alert, TextInput } from 'react-native';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { inventoryApi, salesApi, api } from '../../../lib/api';

const LazyBarcodeScanner = lazy(() =>
  import('../../../components/BarcodeScanner').then((m) => ({ default: m.BarcodeScanner }))
);
import { useOfflineSync } from '../../../hooks/useOfflineSync';
import { initOfflineDb, queueOfflineSale, cacheMedicines } from '../../../lib/offlineDb';
import { useSessionStore } from '../../../store/sessionStore';
import { useCartStore, CartItem } from '../../../store/cartStore';
import { useDebounce } from '../../../hooks/useDebounce';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { Button } from '../../../components/ui/Button';
import { SearchBar } from '../../../components/ui/SearchBar';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { StatRow } from '../../../components/ui/StatRow';
import { toast } from '../../../lib/toast';

export default function NewSaleScreen() {
  const { user } = useSessionStore();
  const queryClient = useQueryClient();
  const { isOnline, pendingCount } = useOfflineSync();
  const [showScanner, setShowScanner] = useState(false);

  useEffect(() => {
    initOfflineDb();
  }, []);

  // Cart state from Zustand — survives navigations
  const {
    items, bill_discount, customer_id, payment_mode, payment_status, paid_amount,
    addItem, removeItem, updateQuantity, setDiscount, setCustomer, setPayment, clearCart,
    getSubtotal, getGstAmount, getNetAmount, getBalanceDue,
  } = useCartStore();

  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Search
  const [searchText, setSearchText] = useState('');
  const debouncedSearch = useDebounce(searchText, 400);

  const { data: searchResults, isLoading: searching } = useQuery({
    queryKey: ['medicine_search', debouncedSearch],
    queryFn: () => inventoryApi.searchMedicines(debouncedSearch).then(r => r.data),
    enabled: debouncedSearch.length >= 2,
  });

  useEffect(() => {
    if (isOnline && searchResults?.results?.length) {
      cacheMedicines(searchResults.results as any[]);
    }
  }, [isOnline, searchResults]);

  const handleBarcodeScanned = async (code: string) => {
    setShowScanner(false);
    try {
      const r = await inventoryApi.searchMedicinesByBarcode(code.trim());
      const results = r.data.results as any[];
      if (results?.length) {
        handleAddToCart(results[0]);
        toast.success('Added from barcode');
      } else {
        Alert.alert(
          'Medicine not found',
          'No medicine matches this barcode. Add it in Inventory?',
          [{ text: 'OK' }]
        );
      }
    } catch {
      toast.error('Barcode lookup failed');
    }
  };

  // Customer search
  const [custSearch, setCustSearch] = useState('');
  const debouncedCust = useDebounce(custSearch, 400);
  const [showCustSheet, setShowCustSheet] = useState(false);
  const [selectedCustomerName, setSelectedCustomerName] = useState<string | null>(null);

  const { data: customerResults } = useQuery({
    queryKey: ['customer_search', debouncedCust],
    queryFn: () => api.get('/customers', { params: { q: debouncedCust } }).then(r => r.data.data),
    enabled: debouncedCust.length >= 2,
  });

  // New customer quick add
  const [showNewCust, setShowNewCust] = useState(false);
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');

  const newCustMutation = useMutation({
    mutationFn: (payload: any) => api.post('/customers', payload).then(r => r.data.data),
    onSuccess: (data: any) => {
      setCustomer(data.id);
      setSelectedCustomerName(data.name);
      setShowNewCust(false);
      setNewCustName('');
      setNewCustPhone('');
      toast.success('Customer created');
    },
  });

  // Sale mutation
  const saleMutation = useMutation({
    mutationFn: (payload: any) => salesApi.create(payload).then(r => r.data),
    onSuccess: (data: any) => {
      clearCart();
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['medicine_search'] });
      toast.success('Sale created successfully!');
      router.replace({ pathname: '/(app)/billing/[id]', params: { id: data.data.id } });
    },
    onError: (err: any) => {
      Alert.alert('Error', err.response?.data?.error || 'Failed to create sale');
    },
  });

  const handleAddToCart = (medicine: any) => {
    // Auto-select batch — FIFO: oldest expiry first, not expired, has stock
    const batches = medicine.batches || [];
    const validBatch = batches
      .filter((b: any) => b.quantity_remaining > 0 && new Date(b.expiry_date) > new Date())
      .sort((a: any, b: any) => new Date(a.expiry_date).getTime() - new Date(b.expiry_date).getTime())[0];

    if (!validBatch) {
      // Show substitutes if available
      const subs = searchResults?.substitutes || [];
      if (subs.length > 0) {
        Alert.alert(
          'Out of Stock',
          `${medicine.name} is out of stock. ${subs.length} substitute(s) available.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Out of Stock', `${medicine.name} is out of stock and no substitutes found.`);
      }
      return;
    }

    const cartItem: CartItem = {
      medicine_id: medicine.id,
      medicine_name: medicine.name,
      batch_id: validBatch.id,
      batch_number: validBatch.batch_number,
      expiry_date: validBatch.expiry_date,
      quantity: 1,
      mrp: Number(validBatch.mrp),
      discount_pct: 0,
      gst_rate: medicine.gst_rate || 0,
      available_stock: validBatch.quantity_remaining,
    };

    addItem(cartItem);
    toast.success(`${medicine.name} added to cart`);
  };

  const handleConfirmSale = () => {
    if (items.length === 0) {
      Alert.alert('Empty Cart', 'Add at least one medicine to the cart');
      return;
    }

    const payload = {
      customer_id: customer_id || undefined,
      discount: bill_discount,
      payment_mode,
      payment_status,
      paid_amount: payment_status === 'paid' ? getNetAmount() : paid_amount,
      items: items.map(item => ({
        medicine_id: item.medicine_id,
        batch_id: item.batch_id,
        quantity: item.quantity,
        mrp: item.mrp,
        discount_pct: item.discount_pct,
        gst_rate: item.gst_rate,
      })),
    };

    if (!isOnline) {
      queueOfflineSale(payload);
      clearCart();
      toast.success(`Saved offline — will sync when online (${pendingCount + 1} pending)`);
      router.replace('/(app)/billing');
      return;
    }

    saleMutation.mutate(payload);
  };

  // ---------- STEP 1: Build Cart ----------
  if (step === 1) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
        {showScanner && (
          <Suspense fallback={null}>
            <LazyBarcodeScanner onScanned={handleBarcodeScanned} onClose={() => setShowScanner(false)} />
          </Suspense>
        )}
        {!isOnline && (
          <View style={{ backgroundColor: 'rgba(234,179,8,0.2)', padding: 10, marginHorizontal: 16, marginTop: 8, borderRadius: 8 }}>
            <Text style={{ color: '#fbbf24', fontSize: 13, textAlign: 'center' }}>
              You are offline. Sales will sync when connection returns{pendingCount > 0 ? ` (${pendingCount} pending)` : ''}.
            </Text>
          </View>
        )}
        <View style={{ padding: 16, flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <SearchBar
                testID="medicine-search"
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Search medicines..."
              />
            </View>
            <TouchableOpacity
              onPress={() => setShowScanner(true)}
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                backgroundColor: theme.bg.surface,
                borderWidth: 1,
                borderColor: 'rgba(255,255,255,0.08)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 12,
              }}
            >
              <Ionicons name="barcode-outline" size={26} color={theme.accent.primary} />
            </TouchableOpacity>
          </View>

          {/* Search Results */}
          {debouncedSearch.length >= 2 && (
            <View style={{ maxHeight: 280, marginBottom: 12 }}>
              {searching ? (
                <Text style={{ color: theme.text.muted, textAlign: 'center', padding: 16 }}>Searching...</Text>
              ) : (
                <FlatList
                  data={searchResults?.results || []}
                  keyExtractor={(item: any) => item.id}
                  ListEmptyComponent={<Text style={{ color: theme.text.muted, textAlign: 'center', padding: 16 }}>No results found</Text>}
                  renderItem={({ item }: { item: any }) => {
                    const stock = item.medicine_stock?.[0]?.total_stock || 0;
                    return (
                      <Card style={{ marginBottom: 6 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <View style={{ flex: 1 }}>
                            <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{item.name}</Text>
                            {item.generic_name && <Text style={{ color: theme.text.muted, fontSize: 12 }}>{item.generic_name}</Text>}
                            <Text style={{ color: stock > 0 ? theme.status.success : theme.status.error, fontSize: 12, marginTop: 2 }}>
                              Stock: {stock}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => handleAddToCart(item)}
                            style={{
                              backgroundColor: theme.accent.primary, borderRadius: 8,
                              paddingHorizontal: 14, paddingVertical: 8,
                            }}
                          >
                            <Text style={{ color: '#fff', fontWeight: '600', fontSize: 13 }}>Add</Text>
                          </TouchableOpacity>
                        </View>
                      </Card>
                    );
                  }}
                />
              )}

              {/* Substitutes section */}
              {searchResults?.substitutes?.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  <Text style={{ color: theme.status.warning, fontSize: 12, fontWeight: '600', marginBottom: 4 }}>SUBSTITUTES AVAILABLE</Text>
                  {searchResults.substitutes.map((sub: any) => (
                    <Card key={sub.id} style={{ marginBottom: 4 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <View>
                          <Text style={{ color: theme.text.primary, fontSize: 13 }}>{sub.name}</Text>
                          <Text style={{ color: theme.status.success, fontSize: 11 }}>Stock: {sub.medicine_stock?.[0]?.total_stock || 0}</Text>
                        </View>
                        <TouchableOpacity onPress={() => handleAddToCart(sub)} style={{ backgroundColor: theme.status.warning, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 }}>
                          <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>Add</Text>
                        </TouchableOpacity>
                      </View>
                    </Card>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Cart Items */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, marginTop: 8 }}>
            <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700' }}>
              Cart ({items.length})
            </Text>
            {items.length > 0 && (
              <TouchableOpacity onPress={() => { Alert.alert('Clear Cart', 'Remove all items?', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: clearCart }]); }}>
                <Text style={{ color: theme.status.error, fontSize: 13 }}>Clear All</Text>
              </TouchableOpacity>
            )}
          </View>

          <FlatList
            data={items}
            keyExtractor={(item) => `${item.medicine_id}-${item.batch_id}`}
            ListEmptyComponent={
              <View style={{ alignItems: 'center', padding: 32 }}>
                <Ionicons name="cart-outline" size={48} color={theme.text.muted} />
                <Text style={{ color: theme.text.muted, marginTop: 8 }}>Your cart is empty</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Card style={{ marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text.primary, fontWeight: '600', fontSize: 14 }}>{item.medicine_name}</Text>
                    <Text style={{ color: theme.text.muted, fontSize: 11, marginTop: 2 }}>
                      Batch: {item.batch_number} | Exp: {item.expiry_date.slice(0, 7)}
                    </Text>
                    <Text style={{ color: theme.text.muted, fontSize: 11 }}>MRP: ₹{item.mrp} | GST: {item.gst_rate}%</Text>
                  </View>

                  {/* Quantity stepper */}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      onPress={() => updateQuantity(item.medicine_id, item.batch_id, item.quantity - 1)}
                      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.bg.surface, justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Ionicons name="remove" size={18} color={theme.text.primary} />
                    </TouchableOpacity>
                    <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', minWidth: 24, textAlign: 'center' }}>{item.quantity}</Text>
                    <TouchableOpacity
                      onPress={() => {
                        if (item.quantity >= item.available_stock) {
                          toast.error(`Max stock: ${item.available_stock}`);
                          return;
                        }
                        updateQuantity(item.medicine_id, item.batch_id, item.quantity + 1);
                      }}
                      style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: theme.bg.surface, justifyContent: 'center', alignItems: 'center' }}
                    >
                      <Ionicons name="add" size={18} color={theme.text.primary} />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity onPress={() => removeItem(item.medicine_id, item.batch_id)} style={{ marginLeft: 12 }}>
                    <Ionicons name="trash-outline" size={20} color={theme.status.error} />
                  </TouchableOpacity>
                </View>

                {item.quantity >= item.available_stock && (
                  <Text style={{ color: theme.status.warning, fontSize: 11, marginTop: 4 }}>⚠ Maximum stock reached</Text>
                )}

                <Text style={{ color: theme.accent.primary, fontSize: 14, fontWeight: '700', textAlign: 'right', marginTop: 4 }}>
                  ₹{(item.quantity * item.mrp * (1 - item.discount_pct / 100)).toFixed(2)}
                </Text>
              </Card>
            )}
          />
        </View>

        {/* Bottom Summary */}
        {items.length > 0 && (
          <View style={{ padding: 16, backgroundColor: theme.bg.surface, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
              <Text style={{ color: theme.text.muted }}>Subtotal</Text>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>₹{getSubtotal().toFixed(2)}</Text>
            </View>
            <Button label="Continue to Payment" onPress={() => setStep(2)} fullWidth icon="arrow-forward-outline" />
          </View>
        )}
      </View>
    );
  }

  // ---------- STEP 2: Customer & Payment ----------
  if (step === 2) {
    return (
      <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {/* Customer */}
          <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Customer (Optional)</Text>

          {selectedCustomerName ? (
            <Card style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{selectedCustomerName}</Text>
                </View>
                <TouchableOpacity onPress={() => { setCustomer(null); setSelectedCustomerName(null); }}>
                  <Ionicons name="close-circle" size={22} color={theme.status.error} />
                </TouchableOpacity>
              </View>
            </Card>
          ) : (
            <View style={{ marginBottom: 16 }}>
              <SearchBar value={custSearch} onChangeText={setCustSearch} placeholder="Search customer by name/phone..." />

              {customerResults?.length > 0 && (
                <FlatList
                  data={customerResults}
                  keyExtractor={(item: any) => item.id}
                  style={{ maxHeight: 160 }}
                  renderItem={({ item }: { item: any }) => (
                    <TouchableOpacity
                      onPress={() => {
                        setCustomer(item.id);
                        setSelectedCustomerName(item.name);
                        setCustSearch('');
                      }}
                      style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}
                    >
                      <Text style={{ color: theme.text.primary }}>{item.name}</Text>
                      <Text style={{ color: theme.text.muted, fontSize: 12 }}>{item.phone}</Text>
                    </TouchableOpacity>
                  )}
                />
              )}

              <TouchableOpacity
                onPress={() => setShowNewCust(true)}
                style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8 }}
              >
                <Ionicons name="add-circle-outline" size={20} color={theme.accent.primary} />
                <Text style={{ color: theme.accent.primary, marginLeft: 6, fontWeight: '600' }}>Add New Customer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Bill Discount */}
          <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Bill Discount (₹)</Text>
          <View style={{ backgroundColor: theme.bg.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, height: 50, marginBottom: 16, justifyContent: 'center' }}>
            <TextInput
              keyboardType="numeric"
              placeholderTextColor={theme.text.muted}
              placeholder="0"
              value={bill_discount > 0 ? String(bill_discount) : ''}
              onChangeText={(v) => setDiscount(Number(v) || 0)}
              style={{ color: theme.text.primary, fontSize: 16 }}
            />
          </View>

          {/* Payment Mode */}
          <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Payment Mode</Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {(['cash', 'upi', 'card', 'credit'] as const).map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => {
                  if (mode === 'credit') {
                    setPayment('credit', 'credit', 0);
                  } else {
                    setPayment(mode, 'paid', getNetAmount());
                  }
                }}
                style={{
                  paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20,
                  backgroundColor: payment_mode === mode ? theme.accent.primary : theme.bg.card,
                }}
              >
                <Text style={{ color: payment_mode === mode ? '#fff' : theme.text.primary, fontWeight: '600', textTransform: 'uppercase' }}>{mode}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Partial Payment */}
          {payment_status === 'partial' || (payment_mode !== 'credit' && payment_status !== 'paid') ? null : null}
          {payment_mode !== 'credit' && (
            <TouchableOpacity onPress={() => setPayment(payment_mode, 'partial', 0)} style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.accent.secondary, fontWeight: '600' }}>→ Partial Payment?</Text>
            </TouchableOpacity>
          )}

          {payment_status === 'partial' && (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ color: theme.text.primary, fontWeight: '600', marginBottom: 6 }}>Paid Amount (₹)</Text>
              <View style={{ backgroundColor: theme.bg.surface, borderRadius: theme.radius.sm, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 12, height: 50, justifyContent: 'center' }}>
                <TextInput
                  keyboardType="numeric"
                  placeholderTextColor={theme.text.muted}
                  placeholder="0"
                  value={paid_amount > 0 ? String(paid_amount) : ''}
                  onChangeText={(v) => setPayment(payment_mode, 'partial', Number(v) || 0)}
                  style={{ color: theme.text.primary, fontSize: 16 }}
                />
              </View>
            </View>
          )}

          {/* Summary */}
          <Card style={{ marginTop: 8, marginBottom: 16 }}>
            <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Bill Summary</Text>
            <StatRow label="Subtotal" value={`₹${getSubtotal().toFixed(2)}`} />
            <StatRow label="Discount" value={`-₹${bill_discount.toFixed(2)}`} valueColor={theme.status.success} />
            <StatRow label="GST" value={`₹${getGstAmount().toFixed(2)}`} />
            <StatRow label="Net Amount" value={`₹${getNetAmount().toFixed(2)}`} valueColor={theme.accent.primary} />
            {getBalanceDue() > 0 && <StatRow label="Balance Due" value={`₹${getBalanceDue().toFixed(2)}`} valueColor={theme.status.error} />}
          </Card>
        </ScrollView>

        {/* Bottom buttons */}
        <View style={{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: theme.bg.surface, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
          <Button label="Back" variant="secondary" onPress={() => setStep(1)} style={{ flex: 1 }} />
          <Button label="Review" onPress={() => setStep(3)} style={{ flex: 2 }} icon="checkmark-outline" />
        </View>

        {/* New Customer Modal */}
        <BottomSheet visible={showNewCust} onClose={() => setShowNewCust(false)} title="Add Customer">
          <View style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.text.primary, marginBottom: 4 }}>Name *</Text>
            <View style={{ backgroundColor: theme.bg.card, borderRadius: 8, paddingHorizontal: 12, height: 46, justifyContent: 'center' }}>
              <TextInput value={newCustName} onChangeText={setNewCustName} style={{ color: theme.text.primary }} placeholderTextColor={theme.text.muted} placeholder="Customer name" />
            </View>
          </View>
          <View style={{ marginBottom: 16 }}>
            <Text style={{ color: theme.text.primary, marginBottom: 4 }}>Phone</Text>
            <View style={{ backgroundColor: theme.bg.card, borderRadius: 8, paddingHorizontal: 12, height: 46, justifyContent: 'center' }}>
              <TextInput value={newCustPhone} onChangeText={setNewCustPhone} keyboardType="phone-pad" style={{ color: theme.text.primary }} placeholderTextColor={theme.text.muted} placeholder="Phone number" />
            </View>
          </View>
          <Button label="Create Customer" onPress={() => newCustMutation.mutate({ name: newCustName, phone: newCustPhone || undefined })} loading={newCustMutation.isPending} fullWidth />
        </BottomSheet>
      </View>
    );
  }

  // ---------- STEP 3: Review & Confirm ----------
  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ color: theme.text.primary, fontSize: 20, fontWeight: '800', marginBottom: 16 }}>Review Sale</Text>

        {selectedCustomerName && (
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>CUSTOMER</Text>
            <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{selectedCustomerName}</Text>
          </Card>
        )}

        <Card style={{ marginBottom: 12 }}>
          <Text style={{ color: theme.text.muted, fontSize: 12, marginBottom: 8 }}>ITEMS ({items.length})</Text>
          {items.map((item) => (
            <View key={`${item.medicine_id}-${item.batch_id}`} style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text.primary, fontSize: 13 }}>{item.medicine_name}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 11 }}>Batch: {item.batch_number} × {item.quantity}</Text>
              </View>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>₹{(item.quantity * item.mrp).toFixed(2)}</Text>
            </View>
          ))}
        </Card>

        <Card style={{ marginBottom: 12 }}>
          <StatRow label="Subtotal" value={`₹${getSubtotal().toFixed(2)}`} />
          <StatRow label="Discount" value={`-₹${bill_discount.toFixed(2)}`} valueColor={theme.status.success} />
          <StatRow label="GST" value={`₹${getGstAmount().toFixed(2)}`} />
          <StatRow label="Net Amount" value={`₹${getNetAmount().toFixed(2)}`} valueColor={theme.accent.primary} />
          <StatRow label="Payment Mode" value={payment_mode.toUpperCase()} />
          <StatRow label="Paid Amount" value={`₹${(payment_status === 'paid' ? getNetAmount() : paid_amount).toFixed(2)}`} />
          {getBalanceDue() > 0 && <StatRow label="Balance Due" value={`₹${getBalanceDue().toFixed(2)}`} valueColor={theme.status.error} />}
        </Card>
      </ScrollView>

      <View style={{ flexDirection: 'row', gap: 12, padding: 16, backgroundColor: theme.bg.surface, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
        <Button label="Back" variant="secondary" onPress={() => setStep(2)} style={{ flex: 1 }} />
        <Button
          label={isOnline ? 'Confirm Sale' : 'Save Offline'}
          onPress={handleConfirmSale}
          loading={saleMutation.isPending && isOnline}
          style={{ flex: 2 }}
          icon="checkmark-circle-outline"
        />
      </View>
    </View>
  );
}
