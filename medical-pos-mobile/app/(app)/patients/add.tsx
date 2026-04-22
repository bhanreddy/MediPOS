import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

import { useTheme } from '@/hooks/useTheme';
import { useCreateCustomer, useUpdateCustomer, useCustomer } from '@/hooks/useCustomers';
import { FloatingInput } from '@/components/ui/FloatingInput';
import { useUIStore } from '@/stores/uiStore';

// Note: Date picker omitted for native dependency simplicity; using a masked text approach for DOB
export default function AddPatientScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const addToast = useUIStore(s => s.addToast);
  const { editId } = useLocalSearchParams<{ editId?: string }>();
  
  const isEditing = !!editId;
  const { data: existingCust } = useCustomer(editId || '');
  const createMutation = useCreateCustomer();
  const updateMutation = useUpdateCustomer();

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [dob, setDob] = useState('');

  // Pre-fill if editing
  useEffect(() => {
    if (existingCust && existingCust.customer) {
      const c = existingCust.customer;
      setName(c.name);
      setPhone(c.phone);
      setEmail(c.email || '');
      setAddress(c.address || '');
      setDoctorName(c.doctorName || '');
    }
  }, [existingCust]);

  const handleSave = () => {
    if (!name.trim()) {
      addToast('Patient Name is required', 'error');
      return;
    }
    if (!phone.trim()) {
      addToast('Phone number is required', 'error');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const payload = {
      name,
      phone: phone.trim(),
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      doctor_name: doctorName.trim() || undefined,
    };

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
          {isEditing ? 'Edit Patient' : 'Add New Patient'}
        </Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
           
           <FloatingInput 
             label="Full Name *" 
             value={name} 
             onChangeText={setName} 
             rightIcon={<Ionicons name="person-outline" size={20} color={theme.colors.text.tertiary} />}
           />
           
           <FloatingInput 
             label="Phone Number *" 
             value={phone} 
             onChangeText={setPhone} 
             keyboardType="phone-pad"
             rightIcon={<Ionicons name="call-outline" size={20} color={theme.colors.text.tertiary} />}
           />

           <FloatingInput 
             label="Email Address" 
             value={email} 
             onChangeText={setEmail} 
             keyboardType="email-address"
             autoCapitalize="none"
             rightIcon={<Ionicons name="mail-outline" size={20} color={theme.colors.text.tertiary} />}
           />
           
           <Text style={[styles.sectionHeading, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold }]}>Billing Information</Text>

           <FloatingInput 
             label="Complete Address" 
             value={address} 
             onChangeText={setAddress} 
           />

           <View style={{ flexDirection: 'row', gap: 12 }}>
              <View style={{ flex: 1 }}>
                 <FloatingInput 
                   label="Referring doctor (optional)" 
                   value={doctorName} 
                   onChangeText={setDoctorName} 
                   autoCapitalize="characters"
                 />
              </View>
              <View style={{ flex: 1 }}>
                 <FloatingInput 
                   label="Date of Birth" 
                   value={dob} 
                   onChangeText={setDob} 
                   rightIcon={<Ionicons name="calendar-outline" size={20} color={theme.colors.text.tertiary} />}
                 />
              </View>
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
             <Text style={{ color: '#FFF', fontFamily: theme.typography.family.semiBold, fontSize: 16 }}>Save Patient Info</Text>
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
  scrollContent: { padding: 16, paddingBottom: 40 },
  sectionHeading: { fontSize: 15, marginBottom: 16, marginTop: 12 },
  footer: { padding: 16, borderTopWidth: 0.5 },
  saveBtn: { height: 56, borderRadius: 12, justifyContent: 'center', alignItems: 'center' }
});
