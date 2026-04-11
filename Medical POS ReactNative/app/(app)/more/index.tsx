import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { useSession } from '../../../hooks/useSession';
import { useRole } from '../../../hooks/useRole';
import { Card } from '../../../components/ui/Card';

const menuItems = [
  { label: 'Suppliers', icon: 'business-outline', route: '/(app)/more/suppliers' },
  { label: 'Expenses', icon: 'card-outline', route: '/(app)/more/expenses' },
  { label: 'Accounting', icon: 'calculator-outline', route: '/(app)/more/accounting' },
  { label: 'Customers', icon: 'people-outline', route: '/(app)/customers' },
  { label: 'Shortbook', icon: 'clipboard-outline', route: '/(app)/shortbook' },
  { label: 'Purchases', icon: 'cart-outline', route: '/(app)/purchases' },
  { label: 'Settings', icon: 'settings-outline', route: '/(app)/settings' },
];

export default function MoreScreen() {
  const { signOut } = useSession();
  const { isOwner } = useRole();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      {menuItems.map((item) => (
        <Card key={item.label} onPress={() => router.push(item.route as any)} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: theme.bg.surface, justifyContent: 'center', alignItems: 'center', marginRight: 14 }}>
              <Ionicons name={item.icon as any} size={22} color={theme.accent.primary} />
            </View>
            <Text style={{ color: theme.text.primary, fontSize: 16, fontWeight: '600', flex: 1 }}>{item.label}</Text>
            <Ionicons name="chevron-forward" size={20} color={theme.text.muted} />
          </View>
        </Card>
      ))}

      <TouchableOpacity onPress={handleSignOut} style={{ marginTop: 24, padding: 16, alignItems: 'center' }}>
        <Text style={{ color: theme.status.error, fontWeight: '700', fontSize: 16 }}>Sign Out</Text>
      </TouchableOpacity>

      <Text style={{ color: theme.text.muted, textAlign: 'center', fontSize: 11, marginTop: 16 }}>Medical POS v1.0.0</Text>
    </ScrollView>
  );
}
