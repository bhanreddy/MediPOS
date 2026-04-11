import { Modal, View, Text, TouchableOpacity, TouchableWithoutFeedback, ScrollView, Dimensions } from 'react-native';
import { theme } from '../../constants/theme';
import { Ionicons } from '@expo/vector-icons';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  snapPoints?: number[];
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function BottomSheet({ visible, onClose, title, children, snapPoints }: BottomSheetProps) {
  const maxHeight = snapPoints?.[0] ? SCREEN_HEIGHT * (snapPoints[0] / 100) : SCREEN_HEIGHT * 0.7;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()}>
            <View style={{
              backgroundColor: theme.bg.surface,
              borderTopLeftRadius: theme.radius.lg,
              borderTopRightRadius: theme.radius.lg,
              maxHeight,
              paddingBottom: 34,
            }}>
              <View style={{ alignItems: 'center', paddingTop: 8, paddingBottom: 4 }}>
                <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: 'rgba(255,255,255,0.2)' }} />
              </View>
              
              {title && (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                  <Text style={{ color: theme.text.primary, fontSize: 18, fontWeight: '700' }}>{title}</Text>
                  <TouchableOpacity onPress={onClose}>
                    <Ionicons name="close" size={24} color={theme.text.muted} />
                  </TouchableOpacity>
                </View>
              )}

              <ScrollView style={{ paddingHorizontal: 20, paddingTop: 12 }} showsVerticalScrollIndicator={false}>
                {children}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}
