import { View, Text, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../lib/toast';
import { useState } from 'react';

const medicineSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  generic_name: z.string().optional(),
  manufacturer: z.string().optional(),
  category: z.enum(['tablet', 'syrup', 'injection', 'capsule', 'cream', 'drops', 'other']),
  unit: z.string().default('strip'),
  hsn_code: z.string().optional(),
  gst_rate: z.number(),
  low_stock_threshold: z.number().int().positive().default(10),
  is_schedule_h1: z.boolean().default(false),
});

const GST_RATES = [0, 5, 12, 18];
const CATEGORIES = ['tablet', 'syrup', 'injection', 'capsule', 'cream', 'drops', 'other'];

export default function AddMedicineScreen() {
  const queryClient = useQueryClient();
  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(medicineSchema),
    defaultValues: {
      name: '', generic_name: '', manufacturer: '',
      category: 'tablet' as const, unit: 'strip', hsn_code: '',
      gst_rate: 0, low_stock_threshold: 10, is_schedule_h1: false,
    }
  });

  const selectedGst = watch('gst_rate');
  const selectedCategory = watch('category');
  const isH1 = watch('is_schedule_h1');

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/inventory/medicines', data).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['medicines'] });
      toast.success('Medicine added');
      router.back();
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Failed'),
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Controller control={control} name="name" render={({ field: { onChange, value } }) => (
        <Input label="Name *" value={value} onChangeText={onChange} error={errors.name?.message} placeholder="Medicine name" />
      )} />
      <Controller control={control} name="generic_name" render={({ field: { onChange, value } }) => (
        <Input label="Generic Name" value={value} onChangeText={onChange} placeholder="E.g. Paracetamol" />
      )} />
      <Controller control={control} name="manufacturer" render={({ field: { onChange, value } }) => (
        <Input label="Manufacturer" value={value} onChangeText={onChange} placeholder="E.g. Cipla" />
      )} />

      {/* Category */}
      <Text style={{ color: theme.text.primary, fontWeight: '500', marginBottom: 8 }}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {CATEGORIES.map(cat => (
          <TouchableOpacity key={cat} onPress={() => setValue('category', cat as any)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: selectedCategory === cat ? theme.accent.primary : theme.bg.card }}>
            <Text style={{ color: selectedCategory === cat ? '#fff' : theme.text.primary, fontSize: 12, textTransform: 'capitalize' }}>{cat}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Controller control={control} name="unit" render={({ field: { onChange, value } }) => (
        <Input label="Unit" value={value} onChangeText={onChange} placeholder="strip / bottle / vial" />
      )} />
      <Controller control={control} name="hsn_code" render={({ field: { onChange, value } }) => (
        <Input label="HSN Code" value={value} onChangeText={onChange} placeholder="Optional" />
      )} />

      {/* GST Rate */}
      <Text style={{ color: theme.text.primary, fontWeight: '500', marginBottom: 8 }}>GST Rate (%)</Text>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
        {GST_RATES.map(r => (
          <TouchableOpacity key={r} onPress={() => setValue('gst_rate', r)}
            style={{ flex: 1, paddingVertical: 10, borderRadius: 8, backgroundColor: selectedGst === r ? theme.accent.primary : theme.bg.card, alignItems: 'center' }}>
            <Text style={{ color: selectedGst === r ? '#fff' : theme.text.primary, fontWeight: '600' }}>{r}%</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Controller control={control} name="low_stock_threshold" render={({ field: { onChange, value } }) => (
        <Input label="Low Stock Threshold" value={String(value)} onChangeText={(v) => onChange(Number(v) || 0)} keyboardType="numeric" />
      )} />

      {/* Schedule H1 toggle */}
      <TouchableOpacity onPress={() => setValue('is_schedule_h1', !isH1)} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 24 }}>
        <View style={{ width: 48, height: 28, borderRadius: 14, backgroundColor: isH1 ? theme.accent.primary : theme.bg.card, justifyContent: 'center', paddingHorizontal: 2 }}>
          <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff', alignSelf: isH1 ? 'flex-end' : 'flex-start' }} />
        </View>
        <Text style={{ color: theme.text.primary, marginLeft: 10 }}>Schedule H1</Text>
      </TouchableOpacity>

      <Button label="Add Medicine" onPress={handleSubmit((data) => mutation.mutate(data))} fullWidth loading={mutation.isPending} icon="checkmark-circle-outline" />
    </ScrollView>
  );
}
