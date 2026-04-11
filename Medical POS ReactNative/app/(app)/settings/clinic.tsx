import { View, Text, ScrollView, Alert } from 'react-native';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm, Controller } from 'react-hook-form';
import { useEffect } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { Input } from '../../../components/ui/Input';
import { Button } from '../../../components/ui/Button';
import { toast } from '../../../lib/toast';

export default function ClinicProfileScreen() {
  const { user } = useSessionStore();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clinic_profile', user?.clinic_id],
    queryFn: () => api.get('/clinics/me').then(r => r.data.data),
    enabled: !!user?.clinic_id,
  });

  const { control, handleSubmit, formState: { errors }, reset } = useForm({
    defaultValues: {
      name: '', phone: '', email: '', address: '',
      gstin: '', drug_licence_number: '', invoice_footer: '',
    },
  });

  useEffect(() => {
    if (data) {
      reset({
        name: data.name || '',
        phone: data.phone || '',
        email: data.email || '',
        address: data.address || '',
        gstin: data.gstin || '',
        drug_licence_number: data.drug_licence_number || '',
        invoice_footer: data.invoice_footer || '',
      });
    }
  }, [data, reset]);

  const mutation = useMutation({
    mutationFn: (payload: any) => api.put('/clinics/me', payload).then(r => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clinic_profile'] });
      toast.success('Clinic profile updated');
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Failed'),
  });

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets[0]) {
      toast.info('Logo upload: connect to Supabase storage for production use');
    }
  };

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Controller control={control} name="name" render={({ field: { onChange, value } }) => (
        <Input label="Clinic Name *" value={value} onChangeText={onChange} error={errors.name?.message} />
      )} />

      {data?.slug && (
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: theme.text.muted, fontSize: 12 }}>Slug (read-only)</Text>
          <Text style={{ color: theme.text.primary, fontSize: 14, fontWeight: '600', marginTop: 2 }}>{data.slug}</Text>
        </View>
      )}

      <Controller control={control} name="phone" render={({ field: { onChange, value } }) => (
        <Input label="Phone" value={value} onChangeText={onChange} keyboardType="phone-pad" />
      )} />
      <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
        <Input label="Email" value={value} onChangeText={onChange} keyboardType="email-address" />
      )} />
      <Controller control={control} name="address" render={({ field: { onChange, value } }) => (
        <Input label="Address" value={value} onChangeText={onChange} />
      )} />
      <Controller control={control} name="gstin" render={({ field: { onChange, value } }) => (
        <Input label="GSTIN" value={value} onChangeText={onChange} placeholder="15-digit GSTIN" />
      )} />
      <Controller control={control} name="drug_licence_number" render={({ field: { onChange, value } }) => (
        <Input label="Drug Licence Number" value={value} onChangeText={onChange} />
      )} />

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
        <Button label="Upload Logo" variant="secondary" icon="image-outline" onPress={pickLogo} style={{ flex: 1 }} />
        <Button label="Upload Signature" variant="secondary" icon="create-outline" onPress={pickLogo} style={{ flex: 1 }} />
      </View>

      <Button label="Save" onPress={handleSubmit((d) => mutation.mutate(d))} fullWidth loading={mutation.isPending} icon="checkmark-circle-outline" />
    </ScrollView>
  );
}
