import { Button } from '@/components/ui/Button';
import { AppText as Text } from '@/components/ui/AppText';
import { WorkspaceHeader, WorkspaceIconButton } from '@/components/ui/Workspace';
import { ResponsiveGrid } from '@/components/ui/ResponsiveGrid';
import { useState, useMemo, useEffect, useCallback } from 'react';
import { View, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, Modal, FlatList, TextInput } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';

import { useTheme } from '@/hooks/useTheme';
import { useCreatePurchase, useScanBill } from '@/hooks/usePurchases';
import { useSuppliers } from '@/hooks/useSuppliers';
import { useSearchMedicines } from '@/hooks/useInventory';
import { buildCreatePurchaseBody, type PurchaseFormLineInput } from '@/api/purchases';
import type { Medicine } from '@/api/inventory';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { useUIStore } from '@/stores/uiStore';

interface FormItem {
  id: string;
  medicineId: string;
  name: string;
  batchNumber: string;
  expiryDate: string;
  quantity: string;
  purchasePrice: string;
  mrp: string;
  gstRate: string;
}

function formLineToInput(item: FormItem): PurchaseFormLineInput {
  return {
    medicineId: item.medicineId,
    batchNumber: item.batchNumber,
    expiryDate: item.expiryDate,
    quantity: parseFloat(item.quantity) || 0,
    purchasePrice: parseFloat(item.purchasePrice) || 0,
    mrp: parseFloat(item.mrp) || 0,
    gstRate: parseFloat(item.gstRate) || 12,
  };
}

export default function AddPurchaseScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const addToast = useUIStore((s) => s.addToast);
  const { medicineId, medicineName } = useLocalSearchParams<{ medicineId?: string; medicineName?: string }>();

  const createPurchase = useCreatePurchase();
  const scanBill = useScanBill();

  const goBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.navigate('/(app)/purchases' as never);
    }
  };
  const { data: supplierPages } = useSuppliers({});
  const suppliers = useMemo(
    () => supplierPages?.pages.flatMap((p) => p.data) ?? [],
    [supplierPages],
  );

  const [supplierId, setSupplierId] = useState<string>('');
  const [billNumber, setBillNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');

  const [items, setItems] = useState<FormItem[]>([
    {
      id: Date.now().toString(),
      medicineId: '',
      name: '',
      batchNumber: '',
      expiryDate: '',
      quantity: '1',
      purchasePrice: '',
      mrp: '',
      gstRate: '12',
    },
  ]);

  const [medicineModalRow, setMedicineModalRow] = useState<number | null>(null);
  const [medicineSearch, setMedicineSearch] = useState('');
  const [debouncedMedicineSearch, setDebouncedMedicineSearch] = useState('');

  useEffect(() => {
    if (medicineId && medicineName) {
      setItems([{
        id: Date.now().toString(),
        medicineId,
        name: medicineName,
        batchNumber: '',
        expiryDate: '',
        quantity: '1',
        purchasePrice: '',
        mrp: '',
        gstRate: '12',
      }]);
    }
  }, [medicineId, medicineName]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedMedicineSearch(medicineSearch.trim()), 350);
    return () => clearTimeout(t);
  }, [medicineSearch]);

  useEffect(() => {
    if (medicineModalRow !== null) {
      setMedicineSearch('');
      setDebouncedMedicineSearch('');
    }
  }, [medicineModalRow]);

  const { data: medicineSearchData } = useSearchMedicines(debouncedMedicineSearch);
  const medicinePickList = useMemo(() => {
    const r = medicineSearchData?.results ?? [];
    const s = medicineSearchData?.substitutes ?? [];
    const seen = new Set<string>();
    const out: Medicine[] = [];
    for (const m of [...r, ...s]) {
      if (!seen.has(m.id)) {
        seen.add(m.id);
        out.push(m);
      }
    }
    return out;
  }, [medicineSearchData]);

  const handleScanBill = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const permissionResult = await ImagePicker.requestCameraPermissionsAsync();

    if (permissionResult.granted === false) {
      addToast('Camera permission is required to scan bills.', 'error');
      return;
    }

    const pickerResult = await ImagePicker.launchCameraAsync({
      base64: true,
      allowsEditing: true,
      quality: 0.7,
    });

    if (!pickerResult.canceled && pickerResult.assets && pickerResult.assets[0].base64) {
      scanBill.mutate(
        {
          imageBase64: pickerResult.assets[0].base64,
          mimeType: pickerResult.assets[0].mimeType || 'image/jpeg',
        },
        {
          onSuccess: (data) => {
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setBillNumber(data.billNumber);
            const transformedItems = data.items.map((i, idx) => ({
              id: `${Date.now()}-${idx}`,
              medicineId: '',
              name: i.name,
              batchNumber: i.batchNumber,
              expiryDate: typeof i.expiryDate === 'string' ? i.expiryDate : String(i.expiryDate),
              quantity: i.quantity.toString(),
              purchasePrice: i.purchasePrice.toString(),
              mrp: i.mrp.toString(),
              gstRate: '12',
            }));
            setItems(transformedItems);
            addToast('Bill scanned — choose a catalog medicine per line (inventory)', 'success');
          },
          onError: () => {
            addToast('Failed to read bill data', 'error');
          },
        },
      );
    }
  };

  const syncItemChange = (index: number, key: keyof FormItem, value: string) => {
    const newItems = [...items];
    newItems[index] = { ...newItems[index], [key]: value };
    setItems(newItems);
  };

  const pickMedicineForRow = useCallback((med: Medicine, rowIndex: number) => {
    setItems((prev) => {
      const next = [...prev];
      next[rowIndex] = { ...next[rowIndex], medicineId: med.id, name: med.name };
      return next;
    });
    setMedicineModalRow(null);
    Haptics.selectionAsync();
  }, []);

  const addItemRow = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setItems([
      ...items,
      {
        id: Date.now().toString(),
        medicineId: '',
        name: '',
        batchNumber: '',
        expiryDate: '',
        quantity: '1',
        purchasePrice: '',
        mrp: '',
        gstRate: '12',
      },
    ]);
  };

  const removeItemRow = (index: number) => {
    Haptics.selectionAsync();
    const newItems = [...items];
    newItems.splice(index, 1);
    setItems(newItems);
  };

  const handleSave = () => {
    if (!billNumber.trim() || items.length === 0) {
      addToast('Invoice number and at least 1 item are required', 'error');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const body = buildCreatePurchaseBody({
        supplierId: supplierId || null,
        invoiceNumber: billNumber,
        invoiceDate: invoiceDate.trim() || null,
        items: items.map(formLineToInput),
      });
      createPurchase.mutate(body, {
        onSuccess: goBack,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid purchase data';
      addToast(msg, 'error');
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <WorkspaceHeader title="Record purchase" subtitle="Supplier invoice and received stock" close onBack={goBack} actions={<WorkspaceIconButton icon="camera-outline" label={scanBill.isPending ? "Scanning bill" : "Scan purchase bill"} disabled={scanBill.isPending} onPress={handleScanBill} />} />

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          <Text style={[styles.sectionHeading, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>
            Supplier & Invoice
          </Text>

          <Text style={{ fontSize: 12, color: theme.colors.text.secondary, marginBottom: 8 }}>Supplier (optional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
            <TouchableOpacity
              onPress={() => {
                Haptics.selectionAsync();
                setSupplierId('');
              }}
              style={[
                styles.chip,
                {
                  borderColor: !supplierId ? theme.colors.primary : theme.colors.border,
                  backgroundColor: !supplierId ? theme.colors.primary + '18' : theme.colors.surface,
                },
              ]}
            >
              <Text style={{ fontSize: 13, color: theme.colors.text.primary }}>None</Text>
            </TouchableOpacity>
            {suppliers.map((s) => (
              <TouchableOpacity
                key={s.id}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSupplierId(s.id);
                }}
                style={[
                  styles.chip,
                  {
                    marginLeft: 8,
                    borderColor: supplierId === s.id ? theme.colors.primary : theme.colors.border,
                    backgroundColor: supplierId === s.id ? theme.colors.primary + '18' : theme.colors.surface,
                  },
                ]}
              >
                <Text style={{ fontSize: 13, color: theme.colors.text.primary }} numberOfLines={1}>
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <ResponsiveGrid>
          <FloatingInput label="Invoice number *" value={billNumber} onChangeText={setBillNumber} />
          <FloatingInput label="Invoice date (YYYY-MM-DD)" value={invoiceDate} onChangeText={setInvoiceDate} />

          </ResponsiveGrid>
          <View style={[styles.divider, { backgroundColor: theme.colors.border }]} />
          <Text style={[styles.sectionHeading, { color: theme.colors.text.primary, fontFamily: theme.typography.family.bold }]}>
            Line Items ({items.length})
          </Text>

          <ResponsiveGrid>
          {items.map((item, index) => (
            <View key={item.id} style={[styles.itemBlock, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
              <View style={styles.itemHeader}>
                <Text style={{ color: theme.colors.text.secondary, fontFamily: theme.typography.family.medium }}>Item {index + 1}</Text>
                {items.length > 1 && (
                  <TouchableOpacity onPress={() => removeItemRow(index)}>
                    <Ionicons name="trash-outline" size={20} color={theme.colors.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                style={[styles.pickMedBtn, { borderColor: theme.colors.primary, backgroundColor: theme.colors.primary + '12' }]}
                onPress={() => {
                  setMedicineModalRow(index);
                  Haptics.selectionAsync();
                }}
              >
                <Ionicons name="medkit-outline" size={18} color={theme.colors.primary} />
                <Text
                  style={{ marginLeft: 8, flex: 1, color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}
                  numberOfLines={2}
                >
                  {item.medicineId ? item.name || 'Medicine selected' : 'Choose medicine *'}
                </Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.text.tertiary} />
              </TouchableOpacity>

              <View style={styles.fieldRow}>
                <View style={styles.fieldGrow}>
                  <FloatingInput label="Batch *" value={item.batchNumber} onChangeText={(v) => syncItemChange(index, 'batchNumber', v)} />
                </View>
                <View style={styles.fieldQty}>
                  <FloatingInput label="Qty *" value={item.quantity} onChangeText={(v) => syncItemChange(index, 'quantity', v)} keyboardType="numeric" />
                </View>
              </View>

              <FloatingInput
                label="Expiry date *"
                value={item.expiryDate}
                onChangeText={(v) => syncItemChange(index, 'expiryDate', v)}
              />

              <View style={styles.fieldRow}>
                <View style={styles.fieldGrow}>
                  <FloatingInput
                    label="Cost price *"
                    value={item.purchasePrice}
                    onChangeText={(v) => syncItemChange(index, 'purchasePrice', v)}
                    keyboardType="decimal-pad"
                  />
                </View>
                <View style={styles.fieldGrow}>
                  <FloatingInput label="MRP *" value={item.mrp} onChangeText={(v) => syncItemChange(index, 'mrp', v)} keyboardType="decimal-pad" />
                </View>
              </View>

              <View style={styles.fieldRow}>
                <View style={styles.fieldGst}>
                  <FloatingInput label="GST %" value={item.gstRate} onChangeText={(v) => syncItemChange(index, 'gstRate', v)} keyboardType="decimal-pad" />
                </View>
              </View>
            </View>
          ))}

          </ResponsiveGrid>
          <TouchableOpacity style={[styles.addBtn, { borderColor: theme.colors.primary }]} onPress={addItemRow}>
            <Ionicons name="add" size={20} color={theme.colors.primary} />
            <Text style={{ color: theme.colors.primary, fontFamily: theme.typography.family.semiBold, marginLeft: 8 }}>Add Another Item</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: insets.bottom || 16 }]}>
        <Button title="Confirm purchase" onPress={handleSave} isLoading={createPurchase.isPending} disabled={scanBill.isPending} />
      </View>

      <Modal visible={medicineModalRow !== null} animationType="slide" transparent>
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}>
            <View style={styles.modalHeader}>
              <Text style={{ fontFamily: theme.typography.family.semiBold, fontSize: 17, color: theme.colors.text.primary }}>
                Pick medicine
              </Text>
              <TouchableOpacity onPress={() => setMedicineModalRow(null)} hitSlop={12}>
                <Ionicons name="close" size={26} color={theme.colors.text.primary} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={[styles.modalSearch, { color: theme.colors.text.primary, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
              placeholder="Search name (min 2 chars)"
              placeholderTextColor={theme.colors.text.tertiary}
              value={medicineSearch}
              onChangeText={setMedicineSearch}
              autoFocus
            />
            {debouncedMedicineSearch.length < 2 ? (
              <Text style={{ padding: 16, color: theme.colors.text.tertiary }}>Type at least 2 characters</Text>
            ) : medicinePickList.length === 0 ? (
              <Text style={{ padding: 16, color: theme.colors.text.tertiary }}>No matches</Text>
            ) : (
              <FlatList
                data={medicinePickList}
                keyExtractor={(m) => m.id}
                style={{ maxHeight: 360 }}
                keyboardShouldPersistTaps="handled"
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={[styles.medRow, { borderBottomColor: theme.colors.border }]}
                    onPress={() => medicineModalRow !== null && pickMedicineForRow(item, medicineModalRow)}
                  >
                    <Text style={{ fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>{item.name}</Text>
                    <Text style={{ fontSize: 12, color: theme.colors.text.secondary, marginTop: 4 }}>{item.genericName}</Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  backBtn: { marginRight: 12 },
  headerTitle: { flex: 1, fontSize: 18 },
  camBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,102,204,0.1)',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 16,
    flexShrink: 0,
  },
  scrollContent: { padding: 16, paddingBottom: 20 },
  sectionHeading: { fontSize: 18, marginBottom: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 180,
  },
  divider: { height: 1, marginVertical: 20 },
  itemBlock: { padding: 16, borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  pickMedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 4,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'flex-start',
  },
  fieldGrow: {
    flex: 1,
    minWidth: 0,
  },
  fieldQty: {
    width: 96,
    minWidth: 96,
    flexShrink: 0,
  },
  fieldGst: {
    width: 120,
    minWidth: 120,
  },
  addBtn: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  footer: { padding: 16, borderTopWidth: 0.5 },
  saveBtn: { minHeight: 48, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  modalSearch: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  medRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
