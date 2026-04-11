import { View, Text, ScrollView, Image, ActivityIndicator, Alert } from 'react-native';
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system';
import { theme } from '../../../constants/theme';
import { purchasesApi } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { toast } from '../../../lib/toast';

export default function ScanBillScreen() {
  const queryClient = useQueryClient();
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<any>(null);
  const [billImageUrl, setBillImageUrl] = useState<string | null>(null);
  const [extracting, setExtracting] = useState(false);

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') { Alert.alert('Permission needed', 'Camera access is required.'); return; }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const pickFromGallery = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
    if (!result.canceled && result.assets[0]) setImageUri(result.assets[0].uri);
  };

  const extractBill = async () => {
    if (!imageUri) return;
    setExtracting(true);
    try {
      const base64 = await FileSystem.readAsStringAsync(imageUri, { encoding: FileSystem.EncodingType.Base64 });
      const mimeType = 'image/jpeg';
      const res = await purchasesApi.scanBill(base64, mimeType);
      setExtractedData(res.data.data.extracted);
      setBillImageUrl(res.data.data.bill_image_url);
      toast.success('Bill data extracted!');
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'OCR failed');
    } finally {
      setExtracting(false);
    }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '700', marginBottom: 16 }}>Scan Purchase Bill</Text>

      {/* Capture */}
      {!imageUri && (
        <View style={{ gap: 12, marginBottom: 24 }}>
          <Button label="Take Photo" icon="camera-outline" onPress={takePhoto} fullWidth />
          <Button label="Choose from Gallery" icon="image-outline" onPress={pickFromGallery} fullWidth variant="secondary" />
        </View>
      )}

      {/* Preview */}
      {imageUri && (
        <View style={{ marginBottom: 20 }}>
          <Image source={{ uri: imageUri }} style={{ width: '100%', height: 300, borderRadius: theme.radius.md }} resizeMode="contain" />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <Button label="Retake" variant="secondary" onPress={() => { setImageUri(null); setExtractedData(null); }} style={{ flex: 1 }} />
            {!extractedData && (
              <Button label={extracting ? 'Reading...' : 'Extract Bill Details'} onPress={extractBill} loading={extracting} style={{ flex: 2 }} icon="scan-outline" />
            )}
          </View>
        </View>
      )}

      {/* Loading overlay */}
      {extracting && (
        <Card style={{ marginBottom: 16, alignItems: 'center' as any }}>
          <ActivityIndicator color={theme.accent.primary} size="large" />
          <Text style={{ color: theme.text.primary, marginTop: 12 }}>Reading your bill...</Text>
          <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 4 }}>This may take a few seconds</Text>
        </Card>
      )}

      {/* Extracted data preview */}
      {extractedData && (
        <View>
          <Text style={{ color: theme.accent.primary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Extracted Data</Text>
          <Card style={{ marginBottom: 12 }}>
            <Text style={{ color: theme.text.muted, fontSize: 11 }}>SUPPLIER</Text>
            <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{extractedData.supplier_name || 'Not detected'}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 4 }}>Invoice: {extractedData.invoice_number || '-'}</Text>
            <Text style={{ color: theme.text.muted, fontSize: 12 }}>Date: {extractedData.invoice_date || '-'}</Text>
          </Card>

          <Text style={{ color: theme.text.primary, fontWeight: '600', marginBottom: 8 }}>Items ({extractedData.items?.length || 0})</Text>
          {extractedData.items?.map((item: any, idx: number) => (
            <Card key={idx} style={{ marginBottom: 8, borderLeftWidth: 3, borderLeftColor: item.medicine_name ? theme.accent.primary : theme.status.warning }}>
              <Text style={{ color: theme.text.primary, fontWeight: '600' }}>{item.medicine_name || '⚠ Name not detected'}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>
                Batch: {item.batch_number || '-'} | Exp: {item.expiry_date || '-'}
              </Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>
                Qty: {item.quantity || '-'} | Price: ₹{item.purchase_price || '-'} | MRP: ₹{item.mrp || '-'} | GST: {item.gst_rate || '-'}%
              </Text>
            </Card>
          ))}

          <Button
            label="Use This Data → New Purchase"
            onPress={() => {
              // Pass extracted data to new purchase screen via a global temp store or params
              // For simplicity, navigate and user can manually fill form with data visible
              toast.info('Please verify and edit the fields in the purchase form');
              router.push('/(app)/purchases/new');
            }}
            fullWidth
            style={{ marginTop: 16 }}
            icon="arrow-forward-outline"
          />
        </View>
      )}
    </ScrollView>
  );
}
