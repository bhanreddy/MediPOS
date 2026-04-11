import { View, Text, ScrollView, TextInput, TouchableOpacity, Alert } from 'react-native';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { format } from 'date-fns';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../../constants/theme';
import { api, purchasesApi } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { useDebounce } from '../../../hooks/useDebounce';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { SearchBar } from '../../../components/ui/SearchBar';
import { BottomSheet } from '../../../components/ui/BottomSheet';
import { StatRow } from '../../../components/ui/StatRow';
import { toast } from '../../../lib/toast';

interface PurchaseItem {
  medicine_id: string;
  medicine_name: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  purchase_price: number;
  mrp: number;
  gst_rate: number;
  discount: number;
}

export default function NewPurchaseScreen() {
  const { user } = useSessionStore();
  const queryClient = useQueryClient();

  const [supplierId, setSupplierId] = useState<string | null>(null);
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<PurchaseItem[]>([]);

  // Supplier search
  const [suppSearch, setSuppSearch] = useState('');
  const debouncedSupp = useDebounce(suppSearch, 400);
  const { data: suppResults } = useQuery({
    queryKey: ['supp_search', debouncedSupp],
    queryFn: () => api.get('/suppliers', { params: { q: debouncedSupp } }).then(r => r.data.data),
    enabled: debouncedSupp.length >= 2,
  });

  // Medicine search for item adding
  const [showMedSheet, setShowMedSheet] = useState(false);
  const [medSearch, setMedSearch] = useState('');
  const debouncedMed = useDebounce(medSearch, 400);
  const { data: medResults } = useQuery({
    queryKey: ['med_search_purch', debouncedMed],
    queryFn: () => api.get('/inventory/medicines', { params: { q: debouncedMed } }).then(r => r.data.data),
    enabled: debouncedMed.length >= 2,
  });

  // Item being edited
  const [editingItem, setEditingItem] = useState<PurchaseItem | null>(null);

  const addItemToList = (med: any) => {
    setEditingItem({
      medicine_id: med.id,
      medicine_name: med.name,
      batch_number: '',
      expiry_date: '',
      quantity: 1,
      purchase_price: 0,
      mrp: 0,
      gst_rate: med.gst_rate || 0,
      discount: 0,
    });
    setShowMedSheet(false);
  };

  const saveItem = () => {
    if (!editingItem) return;
    if (!editingItem.batch_number || !editingItem.expiry_date || editingItem.quantity <= 0 || editingItem.purchase_price <= 0 || editingItem.mrp <= 0) {
      Alert.alert('Validation', 'Fill all fields for this item');
      return;
    }
    setItems([...items, editingItem]);
    setEditingItem(null);
  };

  // Calculations
  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.purchase_price * (1 - i.discount / 100)), 0);
  const gst_amount = items.reduce((sum, i) => sum + (i.quantity * i.purchase_price * i.gst_rate / 100), 0);
  const net_amount = subtotal + gst_amount;

  const mutation = useMutation({
    mutationFn: (payload: any) => purchasesApi.create(payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchases'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast.success('Purchase recorded');
      router.back();
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Failed'),
  });

  const handleSubmit = () => {
    if (items.length === 0) { Alert.alert('Error', 'Add at least one item'); return; }
    if (!invoiceNumber) { Alert.alert('Error', 'Invoice number required'); return; }

    mutation.mutate({
      supplier_id: supplierId,
      invoice_number: invoiceNumber,
      invoice_date: format(invoiceDate, 'yyyy-MM-dd'),
      notes,
      items: items.map(i => ({
        medicine_id: i.medicine_id,
        batch_number: i.batch_number,
        expiry_date: i.expiry_date,
        quantity: i.quantity,
        purchase_price: i.purchase_price,
        mrp: i.mrp,
        gst_rate: i.gst_rate,
        discount: i.discount,
      })),
    });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg.primary }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        {/* Supplier */}
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 6 }}>Supplier</Text>
        {supplierId ? (
          <Card style={{ marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text style={{ color: theme.text.primary }}>{supplierName}</Text>
              <TouchableOpacity onPress={() => { setSupplierId(null); setSupplierName(''); }}>
                <Ionicons name="close-circle" size={20} color={theme.status.error} />
              </TouchableOpacity>
            </View>
          </Card>
        ) : (
          <View style={{ marginBottom: 12 }}>
            <SearchBar value={suppSearch} onChangeText={setSuppSearch} placeholder="Search supplier..." />
            {suppResults?.map((s: any) => (
              <TouchableOpacity key={s.id} onPress={() => { setSupplierId(s.id); setSupplierName(s.name); setSuppSearch(''); }}
                style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
                <Text style={{ color: theme.text.primary }}>{s.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Invoice Number */}
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 6 }}>Invoice Number *</Text>
        <View style={{ backgroundColor: theme.bg.surface, borderRadius: 8, paddingHorizontal: 12, height: 48, justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <TextInput value={invoiceNumber} onChangeText={setInvoiceNumber} style={{ color: theme.text.primary, fontSize: 15 }} placeholderTextColor={theme.text.muted} placeholder="E.g. INV-2024-001" />
        </View>

        {/* Invoice Date */}
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 6 }}>Invoice Date</Text>
        <TouchableOpacity onPress={() => setShowDatePicker(true)} style={{ backgroundColor: theme.bg.surface, borderRadius: 8, paddingHorizontal: 12, height: 48, justifyContent: 'center', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <Text style={{ color: theme.text.primary }}>{format(invoiceDate, 'dd MMM yyyy')}</Text>
        </TouchableOpacity>
        {showDatePicker && <DateTimePicker value={invoiceDate} mode="date" display="default" onChange={(_, d) => { setShowDatePicker(false); if (d) setInvoiceDate(d); }} />}

        {/* Notes */}
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 6 }}>Notes</Text>
        <View style={{ backgroundColor: theme.bg.surface, borderRadius: 8, paddingHorizontal: 12, height: 48, justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
          <TextInput value={notes} onChangeText={setNotes} style={{ color: theme.text.primary }} placeholderTextColor={theme.text.muted} placeholder="Optional notes" />
        </View>

        {/* Items */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text style={{ color: theme.text.primary, fontWeight: '700', fontSize: 16 }}>Items ({items.length})</Text>
          <Button label="+ Add Medicine" onPress={() => setShowMedSheet(true)} variant="secondary" />
        </View>

        {items.map((item, idx) => (
          <Card key={idx} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{item.medicine_name}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 12 }}>Batch: {item.batch_number} | Exp: {item.expiry_date}</Text>
                <Text style={{ color: theme.text.muted, fontSize: 12 }}>Qty: {item.quantity} × ₹{item.purchase_price} | MRP: ₹{item.mrp} | GST: {item.gst_rate}%</Text>
              </View>
              <TouchableOpacity onPress={() => setItems(items.filter((_, i) => i !== idx))}>
                <Ionicons name="close-circle" size={20} color={theme.status.error} />
              </TouchableOpacity>
            </View>
            <Text style={{ color: theme.accent.primary, fontWeight: '600', textAlign: 'right', marginTop: 4 }}>₹{(item.quantity * item.purchase_price * (1 - item.discount / 100)).toFixed(2)}</Text>
          </Card>
        ))}

        {/* Editing Item inline form */}
        {editingItem && (
          <Card style={{ marginBottom: 16, borderColor: theme.accent.primary, borderWidth: 1 }}>
            <Text style={{ color: theme.accent.primary, fontWeight: '700', marginBottom: 8 }}>{editingItem.medicine_name}</Text>
            {[
              { label: 'Batch Number', key: 'batch_number', kb: 'default' },
              { label: 'Expiry Date (YYYY-MM-DD)', key: 'expiry_date', kb: 'default' },
              { label: 'Quantity', key: 'quantity', kb: 'numeric' },
              { label: 'Purchase Price', key: 'purchase_price', kb: 'numeric' },
              { label: 'MRP', key: 'mrp', kb: 'numeric' },
            ].map(f => (
              <View key={f.key} style={{ marginBottom: 8 }}>
                <Text style={{ color: theme.text.muted, fontSize: 12, marginBottom: 2 }}>{f.label}</Text>
                <View style={{ backgroundColor: theme.bg.surface, borderRadius: 6, paddingHorizontal: 10, height: 40, justifyContent: 'center' }}>
                  <TextInput
                    keyboardType={f.kb as any}
                    style={{ color: theme.text.primary }}
                    placeholderTextColor={theme.text.muted}
                    value={String((editingItem as any)[f.key] || '')}
                    onChangeText={(v) => {
                      const updated = { ...editingItem } as any;
                      updated[f.key] = f.kb === 'numeric' ? (Number(v) || 0) : v;
                      setEditingItem(updated);
                    }}
                  />
                </View>
              </View>
            ))}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button label="Cancel" variant="ghost" onPress={() => setEditingItem(null)} style={{ flex: 1 }} />
              <Button label="Add Item" onPress={saveItem} style={{ flex: 1 }} />
            </View>
          </Card>
        )}

        {/* Totals */}
        {items.length > 0 && (
          <Card style={{ marginBottom: 16 }}>
            <StatRow label="Subtotal" value={`₹${subtotal.toFixed(2)}`} />
            <StatRow label="GST" value={`₹${gst_amount.toFixed(2)}`} />
            <StatRow label="Net Amount" value={`₹${net_amount.toFixed(2)}`} valueColor={theme.accent.primary} />
          </Card>
        )}
      </ScrollView>

      <View style={{ padding: 16, backgroundColor: theme.bg.surface, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)' }}>
        <Button label="Save Purchase" onPress={handleSubmit} fullWidth loading={mutation.isPending} icon="checkmark-circle-outline" />
      </View>

      {/* Medicine search bottom sheet */}
      <BottomSheet visible={showMedSheet} onClose={() => setShowMedSheet(false)} title="Select Medicine">
        <SearchBar value={medSearch} onChangeText={setMedSearch} placeholder="Search medicine..." />
        {medResults?.map((m: any) => (
          <TouchableOpacity key={m.id} onPress={() => addItemToList(m)} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' }}>
            <Text style={{ color: theme.text.primary }}>{m.name}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>{m.generic_name || m.manufacturer || ''}</Text>
          </TouchableOpacity>
        ))}
      </BottomSheet>
    </View>
  );
}
