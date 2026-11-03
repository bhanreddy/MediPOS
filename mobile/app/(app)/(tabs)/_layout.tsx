import React from 'react';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { CustomTabBar } from '@/components/navigation/TabBar';
import { ErrorBoundary } from '@/components/ErrorBoundary';

/** Stable reference — inline `(props) => <CustomTabBar />` remounts the bar every navigation and can re-open the More sheet. */
function TabBar(props: BottomTabBarProps) {
  return <CustomTabBar {...props} />;
}

export default function TabsLayout() {
  return (
    <ErrorBoundary>
      <Tabs
        screenOptions={{ headerShown: false, lazy: true, freezeOnBlur: true }}
        tabBar={TabBar}
      >
        {/* Keep the focus observer live so dashboard polling can stop on blur. */}
        <Tabs.Screen name="dashboard/index" options={{ freezeOnBlur: false }} />
        <Tabs.Screen name="inventory/index" />
        <Tabs.Screen name="sales/index" />
        <Tabs.Screen name="patients/index" options={{ href: null }} />
        {/* POS is opened from FAB / deep links — keep out of tab order so it does not steal index 3 from "More" */}
        <Tabs.Screen name="pos/index" options={{ href: null }} />
      </Tabs>
    </ErrorBoundary>
  );
}
