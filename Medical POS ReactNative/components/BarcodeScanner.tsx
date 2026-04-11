import { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal, Linking, Platform } from 'react-native';
import { BarCodeScanner } from 'expo-barcode-scanner';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../constants/theme';

type Props = {
  onScanned: (barcode: string) => void;
  onClose: () => void;
};

export function BarcodeScanner({ onScanned, onClose }: Props) {
  const [permission, setPermission] = useState<boolean | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { status } = await BarCodeScanner.requestPermissionsAsync();
      if (!cancelled) {
        setPermission(status === 'granted');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (locked || !data) return;
    setLocked(true);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setTimeout(() => {
      onScanned(data);
      onClose();
    }, 800);
  };

  if (permission === null) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={styles.centered}>
          <Text style={styles.msg}>Checking camera permission…</Text>
        </View>
      </Modal>
    );
  }

  if (permission === false) {
    return (
      <Modal visible animationType="slide" onRequestClose={onClose}>
        <View style={styles.centered}>
          <Text style={styles.msg}>Camera access is required to scan barcodes.</Text>
          <TouchableOpacity
            style={styles.btn}
            onPress={() => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            }}
          >
            <Text style={styles.btnText}>Open Settings</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnSecondary} onPress={onClose}>
            <Text style={styles.btnTextDark}>Close</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <BarCodeScanner
          style={StyleSheet.absoluteFillObject}
          onBarCodeScanned={
            locked
              ? undefined
              : (ev) => {
                  handleBarCodeScanned({ data: ev.data });
                }
          }
          barCodeTypes={[
            BarCodeScanner.Constants.BarCodeType.ean13,
            BarCodeScanner.Constants.BarCodeType.ean8,
            BarCodeScanner.Constants.BarCodeType.code128,
            BarCodeScanner.Constants.BarCodeType.qr,
          ]}
        />
        <View style={styles.overlayTop}>
          <TouchableOpacity style={styles.iconBtn} onPress={onClose} accessibilityLabel="Close scanner">
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
        <View style={styles.hint}>
          <Text style={styles.hintText}>Align barcode in frame</Text>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: theme.bg.primary,
  },
  msg: { color: theme.text.primary, textAlign: 'center', marginBottom: 16 },
  btn: {
    backgroundColor: theme.accent.primary,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  btnSecondary: {
    borderWidth: 1,
    borderColor: theme.border.subtle,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: '#0a0a0a', fontWeight: '700' },
  btnTextDark: { color: theme.text.primary, fontWeight: '600' },
  overlayTop: {
    position: 'absolute',
    top: 48,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  iconBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  hint: {
    position: 'absolute',
    bottom: 56,
    left: 16,
    right: 16,
    alignItems: 'center',
  },
  hintText: { color: '#fff', fontSize: 15, fontWeight: '600' },
});
