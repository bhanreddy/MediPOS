import { ScrollView, Alert, View, Text, TouchableOpacity, Platform } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { format } from 'date-fns';
import DateTimePicker from '@react-native-community/datetimepicker';
import { theme } from '../../../../constants/theme';
import { api } from '../../../../lib/api';
import { Input } from '../../../../components/ui/Input';
import { Button } from '../../../../components/ui/Button';
import { toast } from '../../../../lib/toast';

const CATEGORIES = ['rent', 'salary', 'utilities', 'supplies', 'maintenance', 'misc'];
const PAY_MODES = ['cash', 'upi', 'card', 'bank_transfer'];

const schema = z.object({
  category: z.enum(['rent', 'salary', 'utilities', 'supplies', 'maintenance', 'misc']),
  description: z.string().optional(),
  amount: z.number().positive('Amount required'),
  expense_date: z.string(),
  payment_mode: z.enum(['cash', 'upi', 'card', 'bank_transfer']),
});

export default function AddExpenseScreen() {
  const queryClient = useQueryClient();
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());

  const { control, handleSubmit, formState: { errors }, setValue, watch } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      category: 'misc' as const, description: '', amount: 0,
      expense_date: format(new Date(), 'yyyy-MM-dd'),
      payment_mode: 'cash' as const,
    },
  });

  const cat = watch('category');
  const mode = watch('payment_mode');

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/expenses', data).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['expenses'] }); toast.success('Expense added'); router.back(); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Failed'),
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      {/* Category */}
      <Text style={{ color: theme.text.primary, fontWeight: '500', marginBottom: 8 }}>Category</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        {CATEGORIES.map(c => (
          <TouchableOpacity key={c} onPress={() => setValue('category', c as any)}
            style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, backgroundColor: cat === c ? theme.accent.primary : theme.bg.card }}>
            <Text style={{ color: cat === c ? '#fff' : theme.text.primary, fontSize: 12, textTransform: 'capitalize' }}>{c}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Controller control={control} name="description" render={({ field: { onChange, value } }) => (
        <Input label="Description" value={value} onChangeText={onChange} placeholder="Optional" />
      )} />
      <Controller control={control} name="amount" render={({ field: { onChange, value } }) => (
        <Input label="Amount (₹) *" value={value ? String(value) : ''} onChangeText={(v) => onChange(Number(v) || 0)} keyboardType="numeric" error={errors.amount?.message} />
      )} />

      {/* Date */}
      <Text style={{ color: theme.text.primary, fontWeight: '500', marginBottom: 6 }}>Date *</Text>
      <TouchableOpacity onPress={() => setShowDatePicker(true)}
        style={{ backgroundColor: theme.bg.surface, borderRadius: 8, paddingHorizontal: 12, height: 50, justifyContent: 'center', marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' }}>
        <Text style={{ color: theme.text.primary }}>{format(selectedDate, 'dd MMM yyyy')}</Text>
      </TouchableOpacity>
      {showDatePicker && <DateTimePicker value={selectedDate} mode="date" display="default" onChange={(_, d) => { setShowDatePicker(false); if (d) { setSelectedDate(d); setValue('expense_date', format(d, 'yyyy-MM-dd')); } }} />}

      {/* Payment mode */}
      <Text style={{ color: theme.text.primary, fontWeight: '500', marginBottom: 8 }}>Payment Mode</Text>
      <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {PAY_MODES.map(m => (
          <TouchableOpacity key={m} onPress={() => setValue('payment_mode', m as any)}
            style={{ paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: mode === m ? theme.accent.primary : theme.bg.card }}>
            <Text style={{ color: mode === m ? '#fff' : theme.text.primary, fontWeight: '600', textTransform: 'uppercase', fontSize: 12 }}>{m.replace('_', ' ')}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Button label="Add Expense" onPress={handleSubmit((d) => mutation.mutate(d))} fullWidth loading={mutation.isPending} />
    </ScrollView>
  );
}
