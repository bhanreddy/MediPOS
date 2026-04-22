import React from 'react';
import { Tabs } from 'expo-router';
import { CustomTabBar } from '@/components/navigation/TabBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function TabsLayout() {
  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{ headerShown: false }}
        tabBar={(props) => <CustomTabBar {...props} />}
      >
        <Tabs.Screen name="dashboard/index" />
        <Tabs.Screen name="pos/index" />
        <Tabs.Screen name="inventory/index" />
        <Tabs.Screen name="patients/index" />
      </Tabs>
    </ErrorBoundary>
  );
}
