import { View, Text, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../../constants/theme';
import { useSession } from '../../../hooks/useSession';
import { useRole } from '../../../hooks/useRole';
import { Card } from '../../../components/ui/Card';

export default function SettingsScreen() {
  const { signOut } = useSession();
  const { isOwner, canManageUsers } = useRole();

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  const settingsItems = [
    { label: 'Clinic Profile', icon: 'business-outline', route: '/(app)/settings/clinic', show: true },
    { label: 'Invoice Customization', icon: 'document-text-outline', route: '/(app)/settings/invoice', show: true },
    { label: 'User Management', icon: 'people-outline', route: '/(app)/settings/users', show: canManageUsers },
  ];

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: theme.text.primary, fontSize: 20, fontWeight: '800', marginBottom: 16 }}>Settings</Text>

      {settingsItems.filter(s => s.show).map(item => (
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

      <TouchableOpacity onPress={handleSignOut} style={{ marginTop: 32, padding: 16, alignItems: 'center', backgroundColor: theme.bg.card, borderRadius: theme.radius.md }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name="log-out-outline" size={22} color={theme.status.error} style={{ marginRight: 8 }} />
          <Text style={{ color: theme.status.error, fontWeight: '700', fontSize: 16 }}>Sign Out</Text>
        </View>
      </TouchableOpacity>

      <Text style={{ color: theme.text.muted, textAlign: 'center', fontSize: 11, marginTop: 24 }}>Medical POS v1.0.0</Text>
    </ScrollView>
  );
}
