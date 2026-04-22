import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity,ActivityIndicator, Switch } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { useCreateMedicine, useUpdateMedicine, useMedicine, useMasterSearch } from '@/hooks/useInventory';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { useUIStore } from '@/stores/uiStore';
import { buildMedicinePayloadFromUi, type Medicine } from '@/api/inventory';

const CATEGORIES = ['Tablet', 'Syrup', 'Injection', 'Capsule', 'Cream', 'Drops', 'Other'];
const GST_RATES = [0, 5, 12, 18];
const UNITS = ['strip', 'bottle', 'vial', 'tube', 'piece'];

export default function AddMedicineScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const addToast = useUIStore(s => s.addToast);
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  
  const isEditing = !!editId;
  const { data: existingMed } = useMedicine(editId || '');
  const createMutation = useCreateMedicine();
  const updateMutation = useUpdateMedicine();

  const [name, setName] = useState('');
  const [debouncedName, setDebouncedName] = useState('');
  const [genericName, setGenericName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [hsnCode, setHsnCode] = useState('');
  const [category, setCategory] = useState('Tablet');
  const [gstRate, setGstRate] = useState(12);
  const [reorderLevel, setReorderLevel] = useState(10);
  const [barcode, setBarcode] = useState('');
  const [isScheduleH1, setIsScheduleH1] = useState(false);
  
  const [showSuggestions, setShowSuggestions] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data: masterSuggestions, isFetching: isSearchingMaster } = useMasterSearch(debouncedName);

  // Pre-fill if editing
  useEffect(() => {
    if (existingMed) {
      setName(existingMed.name);
      setGenericName(existingMed.genericName || '');
      setManufacturer(existingMed.manufacturer || '');
      setHsnCode(existingMed.hsnCode || '');
      setCategory(existingMed.category || 'Tablet');
      setGstRate(existingMed.gstRate || 0);
      setReorderLevel(existingMed.reorderLevel || 10);
      setBarcode(existingMed.barcode || '');
      setIsScheduleH1(existingMed.schedule === 'H1');
    }
  }, [existingMed]);

  const handleNameChange = (val: string) => {
    setName(val);
    setShowSuggestions(true);
    
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => setDebouncedName(val), 400);
  };

  const selectSuggestion = (masterMed: Medicine) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setName(masterMed.name);
    setGenericName(masterMed.genericName);
    setManufacturer(masterMed.manufacturer);
    setHsnCode(masterMed.hsnCode);
    setCategory(masterMed.category);
    setGstRate(masterMed.gstRate);
    if (masterMed.schedule === 'H1') setIsScheduleH1(true);
    
    setShowSuggestions(false);
    setDebouncedName('');
  };

  const handleSave = () => {
    if (!name.trim()) {
      addToast('Medicine Name is required', 'error');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = buildMedicinePayloadFromUi({
      name,
      genericName,
      manufacturer,
      categoryLabel: category,
      hsnCode,
      gstRate,
      reorderLevel,
      barcode,
      isScheduleH1,
    });

    if (isEditing) {
      updateMutation.mutate({ id: editId!, body: payload }, {
        onSuccess: () => router.back()
      });
    } else {
      createMutation.mutate(payload, {
        onSuccess: () => router.back()
      });
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background, paddingTop: insets.top }]}>
      <View style={[styles.header, { backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
           <Ionicons name="close" size={24} color={theme.colors.text.primary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]}>
          {isEditing ? 'Edit Medicine' : 'Add New Medicine'}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
           
           {/* Master Search Autocomplete Field */}
           <View style={{ zIndex: 10 }}>
              <FloatingInput label="Medicine Name *" value={name} onChangeText={handleNameChange} />
              
              {showSuggestions && debouncedName.length >= 2 && !isEditing && (
                <View style={[styles.suggestionBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border, ...theme.shadow.card }]}>
                  {isSearchingMaster ? (
                    <ActivityIndicator style={{ padding: 16 }} color={theme.colors.primary} />
                  ) : masterSuggestions && masterSuggestions.length > 0 ? (
                    masterSuggestions.map(med => (
                      <TouchableOpacity key={med.id} style={[styles.suggestionItem, { borderBottomColor: theme.colors.border }]} onPress={() => selectSuggestion(med)}>
                        <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>{med.name}</Text>
                        <Text style={{ color: theme.colors.text.secondary, fontSize: 12 }}>{med.genericName} • {med.manufacturer}</Text>
                      </TouchableOpacity>
                    ))
                  ) : (
                    <Text style={{ padding: 16, color: theme.colors.text.tertiary, textAlign: 'center' }}>No master matches found. Keep typing.</Text>
                  )}
                </View>
              )}
           </View>

           <FloatingInput label="Generic Name" value={genericName} onChangeText={setGenericName} />
           <FloatingInput label="Manufacturer" value={manufacturer} onChangeText={setManufacturer} />
           
           {/* Category Options */}
           <Text style={[styles.sectionHeading, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]}>Category</Text>
           <View style={styles.pillBox}>
              {CATEGORIES.map(cat => (
                <TouchableOpacity key={cat} style={[styles.pill, { backgroundColor: category === cat ? theme.colors.primary : theme.colors.surface }]} onPress={() => { Haptics.selectionAsync(); setCategory(cat); }}>
                  <Text style={{ color: category === cat ? '#FFF' : theme.colors.text.secondary, fontFamily: category === cat ? theme.typography.family.semiBold : theme.typography.family.regular }}>{cat}</Text>
                </TouchableOpacity>
              ))}
           </View>

           {/* GST Options */}
           <Text style={[styles.sectionHeading, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]}>GST Rate</Text>
           <View style={styles.pillBox}>
              {GST_RATES.map(rate => (
                <TouchableOpacity key={`gst-${rate}`} style={[styles.pill, { backgroundColor: gstRate === rate ? theme.colors.primary : theme.colors.surface }]} onPress={() => { Haptics.selectionAsync(); setGstRate(rate); }}>
                  <Text style={{ color: gstRate === rate ? '#FFF' : theme.colors.text.secondary, fontFamily: gstRate === rate ? theme.typography.family.semiBold : theme.typography.family.regular }}>{rate}%</Text>
                </TouchableOpacity>
              ))}
           </View>

           <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
              <View style={{ flex: 1 }}>
                 <FloatingInput label="HSN Code" value={hsnCode} onChangeText={setHsnCode} />
              </View>
              <View style={{ flex: 1 }}>
                 <FloatingInput label="Barcode" value={barcode} onChangeText={setBarcode} rightIcon={<Ionicons name="barcode-outline" size={20} color={theme.colors.primary} />} />
              </View>
           </View>

           {/* Reorder Level */}
           <View style={[styles.reorderRow, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
             <View>
               <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>Low Stock Threshold</Text>
               <Text style={{ color: theme.colors.text.tertiary, fontSize: 11 }}>Alerts when stock falls below</Text>
             </View>
             <View style={[styles.stepper, { borderColor: theme.colors.border }]}>
                 <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setReorderLevel(Math.max(0, reorderLevel - 5)); }} style={styles.stepBtn}><Ionicons name="remove" size={18} color={theme.colors.text.primary} /></TouchableOpacity>
                 <Text style={{ marginHorizontal: 12, fontSize: 16, fontFamily: theme.typography.family.semiBold, color: theme.colors.text.primary }}>{reorderLevel}</Text>
                 <TouchableOpacity onPress={() => { Haptics.selectionAsync(); setReorderLevel(reorderLevel + 5); }} style={styles.stepBtn}><Ionicons name="add" size={18} color={theme.colors.text.primary} /></TouchableOpacity>
             </View>
           </View>

           {/* Schedule H1 Switch */}
           <View style={[styles.h1Row, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
             <View>
               <Text style={{ color: theme.colors.text.primary, fontFamily: theme.typography.family.medium }}>Schedule H1 Drug</Text>
               <Text style={{ color: theme.colors.text.tertiary, fontSize: 11 }}>Marks with warning badge</Text>
             </View>
             <Switch value={isScheduleH1} onValueChange={val => { Haptics.selectionAsync(); setIsScheduleH1(val); }} trackColor={{ true: theme.colors.danger, false: theme.colors.border }} />
           </View>

        </ScrollView>
      </KeyboardAvoidingView>

      <View style={[styles.footer, { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border, paddingBottom: insets.bottom || 16 }]}>
         <TouchableOpacity 
           style={[styles.saveBtn, { backgroundColor: theme.colors.primary }]}
           disabled={createMutation.isPending || updateMutation.isPending}
           onPress={handleSave}
         >
           {createMutation.isPending || updateMutation.isPending ? (
             <ActivityIndicator color="#FFF" />
           ) : (
             <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Save Medicine</Text>
           )}
         </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 0.5 },
  backBtn: { marginRight: 16 },
  headerTitle: { fontSize: 18 },
  scrollContent: { padding: 16, paddingBottom: 60 },
  suggestionBox: { position: 'absolute', top: 56, left: 0, right: 0, zIndex: 100, borderRadius: 12, borderWidth: 0.5, overflow: 'hidden' },
  suggestionItem: { padding: 12, borderBottomWidth: 0.5 },
  sectionHeading: { fontSize: 15, marginBottom: 12, marginTop: 12 },
  pillBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  pill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  reorderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderWidth: 1, borderRadius: 12, marginTop: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 4 },
  stepBtn: { padding: 6 },
  h1Row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderWidth: 1, borderRadius: 12, marginTop: 16 },
  footer: { padding: 16, borderTopWidth: 0.5 },
  saveBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
