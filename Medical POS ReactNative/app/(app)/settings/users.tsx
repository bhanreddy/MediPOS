import { View, Text, ScrollView } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '../../../constants/theme';
import { api } from '../../../lib/api';
import { useSessionStore } from '../../../store/sessionStore';
import { useRole } from '../../../hooks/useRole';
import { LoadingScreen } from '../../../components/ui/LoadingScreen';
import { ErrorScreen } from '../../../components/ui/ErrorScreen';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Card } from '../../../components/ui/Card';
import { Badge } from '../../../components/ui/Badge';

export default function UserManagementScreen() {
  const { user } = useSessionStore();
  const { canManageUsers } = useRole();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['clinic_users', user?.clinic_id],
    queryFn: () => api.get('/clinics/me').then(r => r.data.data),
    enabled: !!user?.clinic_id && canManageUsers,
  });

  if (!canManageUsers) {
    return <EmptyState message="Access Denied" subMessage="Only clinic owners can manage users" icon="lock-closed-outline" />;
  }

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen onRetry={refetch} />;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.bg.primary }} contentContainerStyle={{ padding: 16 }}>
      <Text style={{ color: theme.text.primary, fontSize: 20, fontWeight: '800', marginBottom: 16 }}>User Management</Text>

      <Card style={{ marginBottom: 16 }}>
        <Text style={{ color: theme.text.muted, fontSize: 12 }}>CLINIC</Text>
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginTop: 2 }}>{data?.name}</Text>
        <Text style={{ color: theme.text.muted, fontSize: 12, marginTop: 8 }}>
          User management is handled through the Supabase dashboard or admin API.
          From the dashboard, you can invite users using their email address and assign roles (OWNER, PHARMACIST, CASHIER, VIEWER).
        </Text>
      </Card>

      <Card>
        <Text style={{ color: theme.text.primary, fontWeight: '700', marginBottom: 8 }}>Current User</Text>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <Text style={{ color: theme.text.primary }}>{user?.email}</Text>
          </View>
          <Badge label={user?.role || 'OWNER'} variant="success" />
        </View>
      </Card>
    </ScrollView>
  );
}
