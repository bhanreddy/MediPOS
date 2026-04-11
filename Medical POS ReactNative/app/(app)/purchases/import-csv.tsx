import { View, Text, ScrollView, Alert } from 'react-native';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { theme } from '../../../constants/theme';
import { purchasesApi } from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';
import { toast } from '../../../lib/toast';

const SAMPLE_CSV = `medicine_name,generic_name,manufacturer,batch_number,expiry_date,quantity,purchase_price,mrp,gst_rate
Paracetamol 500mg,Paracetamol,,B001,06/2026,100,2.5,5,12
Amoxicillin 250mg,Amoxicillin,,B002,12/2025,50,8,15,5`;

export default function ImportCsvScreen() {
  const [file, setFile] = useState<any>(null);
  const [result, setResult] = useState<any>(null);

  const pickFile = async () => {
    const res = await DocumentPicker.getDocumentAsync({ type: 'text/csv' });
    if (!res.canceled && res.assets?.[0]) {
      setFile(res.assets[0]);
      setResult(null);
    }
  };

  const downloadSample = async () => {
    try {
      const path = `${FileSystem.documentDirectory}sample_purchase.csv`;
      await FileSystem.writeAsStringAsync(path, SAMPLE_CSV);
      await Sharing.shareAsync(path);
    } catch (err) {
      toast.error('Could not generate sample file');
    }
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('No file selected');
      const formData = new FormData();
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: 'text/csv',
      } as any);
      return purchasesApi.importCsv(formData).then(r => r.data.data);
    },
    onSuccess: (data) => {
      setResult(data);
      toast.success(`${data.success} rows imported`);
    },
    onError: (err: any) => Alert.alert('Error', err.response?.data?.error || 'Import failed'),
  });

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      {/* Instructions */}
      <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Import CSV</Text>
      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.primary, fontWeight: '600', marginBottom: 8 }}>Expected CSV Format</Text>
        <ScrollView horizontal>
          <Text style={{ color: theme.text.muted, fontSize: 11, fontFamily: 'monospace' }}>
            {`medicine_name,generic_name,manufacturer,batch_number,\nexpiry_date(MM/YYYY),quantity,purchase_price,mrp,gst_rate`}
          </Text>
        </ScrollView>
        <Button label="Download Sample CSV" variant="ghost" onPress={downloadSample} icon="download-outline" style={{ marginTop: 12 }} />
      </Card>

      {/* Upload */}
      <Button label={file ? `Selected: ${file.name}` : 'Select CSV File'} onPress={pickFile} fullWidth variant="secondary" icon="document-outline" />

      {file && (
        <View style={{ marginTop: 16 }}>
          <Button label="Import" onPress={() => importMutation.mutate()} fullWidth loading={importMutation.isPending} icon="cloud-upload-outline" />
        </View>
      )}

      {/* Results */}
      {result && (
        <View style={{ marginTop: 24 }}>
          <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '700', marginBottom: 12 }}>Import Results</Text>
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
            <Card style={{ flex: 1 }}>
              <Text style={{ color: theme.status.success, fontSize: 24, fontWeight: '800' }}>{result.success}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>Imported</Text>
            </Card>
            <Card style={{ flex: 1 }}>
              <Text style={{ color: theme.status.error, fontSize: 24, fontWeight: '800' }}>{result.failed}</Text>
              <Text style={{ color: theme.text.muted, fontSize: 12 }}>Failed</Text>
            </Card>
          </View>
          {result.errors?.length > 0 && (
            <View>
              <Text style={{ color: theme.status.error, fontWeight: '600', marginBottom: 8 }}>Errors</Text>
              {result.errors.map((err: any, idx: number) => (
                <Card key={idx} style={{ marginBottom: 6 }}>
                  <Text style={{ color: theme.text.primary, fontSize: 12 }}>Row: {JSON.stringify(err.row).slice(0, 60)}...</Text>
                  <Text style={{ color: theme.status.error, fontSize: 12, marginTop: 2 }}>{err.reason}</Text>
                </Card>
              ))}
            </View>
          )}
        </View>
      )}
    </ScrollView>
  );
}
