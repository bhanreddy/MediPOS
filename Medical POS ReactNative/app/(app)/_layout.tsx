import { Tabs, Redirect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEffect } from 'react';
import { theme } from '../../constants/theme';
import { useSessionStore } from '../../store/sessionStore';
import { useAlerts } from '../../hooks/useAlerts';
import { useOfflineSync } from '../../hooks/useOfflineSync';
import { initOfflineDb } from '../../lib/offlineDb';
import { View, Text } from 'react-native';

export default function AppLayout() {
  const { user } = useSessionStore();
  const { totalAlerts } = useAlerts();
  const { isOnline, pendingCount, isSyncing } = useOfflineSync();

  useEffect(() => {
    initOfflineDb();
  }, []);

  if (!user) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }}>
      {(!isOnline || pendingCount > 0) && (
        <View
          style={{
            backgroundColor: isOnline ? 'rgba(34,197,94,0.15)' : 'rgba(234,179,8,0.2)',
            paddingVertical: 8,
            paddingHorizontal: 12,
            borderBottomWidth: 1,
            borderBottomColor: 'rgba(255,255,255,0.06)',
          }}
        >
          <Text style={{ color: isOnline ? '#4ade80' : '#fbbf24', fontSize: 12, textAlign: 'center', fontWeight: '600' }}>
            {!isOnline
              ? `Offline — sales save locally${pendingCount ? ` (${pendingCount} pending)` : ''}`
              : isSyncing
                ? `Syncing ${pendingCount} offline sale(s)…`
                : `${pendingCount} sale(s) queued — syncing when ready`}
          </Text>
        </View>
      )}
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.bg.surface,
          borderTopColor: 'rgba(255,255,255,0.06)',
          borderTopWidth: 1,
          height: 60,
          paddingBottom: 8,
          paddingTop: 4,
        },
        tabBarActiveTintColor: theme.accent.primary,
        tabBarInactiveTintColor: theme.text.muted,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="grid-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="billing"
        options={{
          title: 'Billing',
          tabBarIcon: ({ color, size }) => <Ionicons name="receipt-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory',
          tabBarIcon: ({ color, size }) => (
            <View>
              <Ionicons name="cube-outline" size={size} color={color} />
              {totalAlerts > 0 && (
                <View style={{
                  position: 'absolute', top: -4, right: -10,
                  backgroundColor: theme.status.error,
                  borderRadius: 10, minWidth: 18, height: 18,
                  justifyContent: 'center', alignItems: 'center',
                }}>
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                    {totalAlerts > 99 ? '99+' : totalAlerts}
                  </Text>
                </View>
              )}
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="reports"
        options={{
          title: 'Reports',
          tabBarIcon: ({ color, size }) => <Ionicons name="bar-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: 'More',
          tabBarIcon: ({ color, size }) => <Ionicons name="menu-outline" size={size} color={color} />,
        }}
      />
      {/* Hidden from tab bar */}
      <Tabs.Screen name="purchases" options={{ href: null }} />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen name="shortbook" options={{ href: null }} />
      <Tabs.Screen name="customers" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
    </Tabs>
    </View>
  );
}
