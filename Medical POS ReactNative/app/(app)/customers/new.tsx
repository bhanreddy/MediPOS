import { ScrollView, Alert } from 'react-native';
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

const schema = z.object({
  name: z.string().min(1, 'Name required'),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  doctor_name: z.string().optional(),
  address: z.string().optional(),
});

export default function AddCustomerScreen() {
  const queryClient = useQueryClient();
  const { control, handleSubmit, formState: { errors } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: { name: '', phone: '', email: '', doctor_name: '', address: '' },
  });

  const mutation = useMutation({
    mutationFn: (data: any) => api.post('/customers', data).then(r => r.data),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['customers'] }); toast.success('Customer added'); router.back(); },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Failed'),
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Controller control={control} name="name" render={({ field: { onChange, value } }) => (
        <Input label="Name *" value={value} onChangeText={onChange} error={errors.name?.message} placeholder="Customer name" />
      )} />
      <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
        <Input label="Phone" value={value} onChangeText={onChange} keyboardType="phone-pad" placeholder="10-digit phone" />
      )} />
      <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
        <Input label="Email" value={value} onChangeText={onChange} keyboardType="email-address" placeholder="email@example.com" />
      )} />
      <Controller control={control} name="doctor_name" render={({ field: { onChange, value } }) => (
        <Input label="Doctor Name" value={value} onChangeText={onChange} placeholder="Referring doctor" />
      )} />
      <Controller control={control} name="address" render={({ field: { onChange, value } }) => (
        <Input label="Address" value={value} onChangeText={onChange} placeholder="Optional address" />
      )} />
      <Button label="Add Customer" onPress={handleSubmit((d) => mutation.mutate(d))} fullWidth loading={mutation.isPending} icon="checkmark-circle-outline" />
    </ScrollView>
  );
}
