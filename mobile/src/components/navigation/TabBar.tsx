import { AppText as Text } from '@/components/ui/AppText';
import { DashboardPanel } from '@/components/dashboard/DashboardPanel';
import { mobileLayout } from '@/theme/mobileLayout';
import React, { useEffect, useState } from 'react';
import {
  View,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  Keyboard,
  Modal,
  ScrollView,
  Platform,
} from 'react-native';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useTheme } from '@/hooks/useTheme';
import {
  LiquidPanel,
  liquidPalette,
  useGlassPreferences,
} from '@/components/glass/LiquidGlass';

type Icon = keyof typeof Ionicons.glyphMap;
const tabs: { route: string; label: string; icon: Icon; active: Icon }[] = [
  {
    route: 'dashboard/index',
    label: 'Home',
    icon: 'home-outline',
    active: 'home',
  },
  {
    route: 'inventory/index',
    label: 'Stock',
    icon: 'cube-outline',
    active: 'cube',
  },
  {
    route: 'sales/index',
    label: 'Sales',
    icon: 'receipt-outline',
    active: 'receipt',
  },
  { route: '__more__', label: 'More', icon: 'grid-outline', active: 'grid' },
];
const moreItems: { label: string; hint: string; icon: Icon; route: string }[] =
  [
    {
      label: 'Patients',
      hint: 'Care that connects',
      icon: 'people-outline',
      route: '/(app)/(tabs)/patients',
    },
    {
      label: 'Expenses',
      hint: 'Keep costs in view',
      icon: 'wallet-outline',
      route: '/(app)/expenses',
    },
    {
      label: 'Reports',
      hint: 'Know your numbers',
      icon: 'bar-chart-outline',
      route: '/(app)/reports',
    },
    {
      label: 'Accounting',
      hint: 'Every detail, balanced',
      icon: 'calculator-outline',
      route: '/(app)/reports/accounting',
    },
    { label: 'Purchases', hint: 'Receive and replenish', icon: 'bag-handle-outline', route: '/(app)/purchases' },
    { label: 'Suppliers', hint: 'Your trusted partners', icon: 'business-outline', route: '/(app)/suppliers' },
    { label: 'Shortbook', hint: 'What to order next', icon: 'clipboard-outline', route: '/(app)/shortbook' },
  ];

function WorkspacePanel({ solid, dark, children, style, ...props }: React.PropsWithChildren<{ solid: boolean; dark: boolean; style?: import('react-native').StyleProp<import('react-native').ViewStyle>; accessibilityViewIsModal?: boolean }>) {
  return solid ? <DashboardPanel {...props} style={style}>{children}</DashboardPanel> : <LiquidPanel {...props} dark={dark} material="chrome" style={style}>{children}</LiquidPanel>;
}

function Dock({ state, navigation, descriptors }: BottomTabBarProps) {
  const { isDark } = useTheme();
  const onDashboard = state.routes[state.index]?.name === 'dashboard/index';
  const p = liquidPalette(isDark),
    insets = useSafeAreaInsets();
  const { reduceMotion } = useGlassPreferences();
  const { width, height, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale, insets.bottom);
  const dockWidth = layout.dockWidth,
    tabWidth = (dockWidth - 12) / 4;
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow', () => setKeyboardVisible(true));
    const hide = Keyboard.addListener(Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide', () => setKeyboardVisible(false));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [moreOpen, setMoreOpen] = useState(false);
  const current = state.routes[state.index]?.name;
  const activeIndex = moreOpen
    ? 3
    : tabs.findIndex((tab) => tab.route === current);
  const position = useSharedValue(Math.max(activeIndex, 0) * tabWidth);
  useEffect(() => {
    const x = Math.max(activeIndex, 0) * tabWidth;
    position.value = reduceMotion
      ? x
      : withSpring(x, { damping: 28, stiffness: 320, mass: 0.7 });
  }, [activeIndex, tabWidth, reduceMotion, position]);
  useEffect(() => {
    setMoreOpen(false);
  }, [current]);
  const pillStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: position.value }],
  }));
  const pressTab = (index: number) => {
    void Haptics.selectionAsync().catch(() => {});
    if (index === 3) {
      setMoreOpen((open) => !open);
      return;
    }
    setMoreOpen(false);
    const route = state.routes.find((item) => item.name === tabs[index].route);
    if (!route) return;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (current !== route.name && !event.defaultPrevented)
      navigation.navigate(route.name, route.params);
  };
  const openMoreItem = (route: string) => {
    setMoreOpen(false);
    router.push(route as never);
  };
  return (
    <>
      <View
        pointerEvents={keyboardVisible ? 'none' : 'box-none'}
        style={[s.outer, { paddingBottom: layout.dockBottom, display: keyboardVisible ? 'none' : 'flex' }]}
      >
        <View
          style={[
            s.shadow,
            { width: dockWidth, shadowColor: isDark ? '#000000' : '#273356', shadowOpacity: 0.06, elevation: 3 },
          ]}
        >
          <WorkspacePanel solid={onDashboard} dark={isDark} style={s.dock}>
            {activeIndex >= 0 && (
              <Animated.View
                pointerEvents="none"
                style={[s.pillPosition, { width: tabWidth, height: layout.dockHeight - 12 }, pillStyle]}
              >
                <View
                  style={[
                    s.pill,
                    { backgroundColor: p.soft, borderColor: p.edge },
                  ]}
                />
              </Animated.View>
            )}
            <View style={s.tabs}>
              {tabs.map((tab, index) => {
                const focused = activeIndex === index;
                const route = state.routes.find(
                  (item) => item.name === tab.route,
                );
                return (
                  <Pressable
                    key={tab.route}
                    accessibilityRole="tab"
                    accessibilityLabel={
                      route
                        ? descriptors[route.key]?.options
                            .tabBarAccessibilityLabel || tab.label
                        : tab.label
                    }
                    accessibilityState={{ selected: focused }}
                    onPress={() => pressTab(index)}
                    onLongPress={() => {
                      if (route)
                        navigation.emit({
                          type: 'tabLongPress',
                          target: route.key,
                        });
                    }}
                    style={[s.tab, { width: tabWidth, minHeight: layout.dockHeight - 12 }]}
                  >
                    <Ionicons
                      name={focused ? tab.active : tab.icon}
                      size={22}
                      color={focused ? p.accent : p.muted}
                    />
                    <Text
                      maxFontSizeMultiplier={1.4}
                      numberOfLines={1}
                      style={[s.label, { color: focused ? p.text : p.muted }]}
                    >
                      {tab.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </WorkspacePanel>
        </View>
      </View>
      <Modal visible={moreOpen} transparent animationType={reduceMotion ? 'none' : 'slide'} onRequestClose={() => setMoreOpen(false)}>
        <View style={[s.modalRoot, { paddingTop: insets.top + 16, paddingBottom: layout.dockBottom }]}>
          <Pressable accessibilityRole="button" accessibilityLabel="Close workspace menu" onPress={() => setMoreOpen(false)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(12,20,39,0.35)' }]} />
          <WorkspacePanel solid={onDashboard} dark={isDark} accessibilityViewIsModal style={{ width: '100%', maxWidth: 560, height: Math.max(0, Math.min(height * 0.86 - layout.dockBottom, height - insets.top - layout.dockBottom - 24, 760)), borderRadius: 16 }}>
            <View style={{ alignItems: 'center', paddingTop: 12 }}><View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: p.muted, opacity: 0.35 }} /></View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close workspace" onPress={() => setMoreOpen(false)} style={{ position: 'absolute', right: 12, top: 18, minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', zIndex: 1 }}>
              <Ionicons name="close" size={23} color={p.muted} />
            </Pressable>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.sheet, { paddingBottom: insets.bottom + 28 }]}
        >
          <Text style={[s.eyebrow, { color: p.muted }]}>YOUR WORKSPACE</Text>
          <Text style={[s.sheetTitle, { color: p.text }]}>
            Everything you need.
          </Text>
          <View style={s.moreGrid}>
            {moreItems.map((item) => (
              <WorkspacePanel solid={onDashboard} dark={isDark} key={item.label} style={[s.morePanel, { width: layout.compact ? '100%' : '48%' }]}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openMoreItem(item.route)}
                  style={s.moreItem}
                >
                  <Ionicons name={item.icon} size={25} color={p.accent} />
                  <Text style={[s.moreLabel, { color: p.text }]}>
                    {item.label}
                  </Text>
                  <Text style={[s.hint, { color: p.muted }]}>{item.hint}</Text>
                  <Ionicons
                    name="arrow-up-outline"
                    size={16}
                    color={p.muted}
                    style={s.moreArrow}
                  />
                </Pressable>
              </WorkspacePanel>
            ))}
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={() => openMoreItem('/(app)/settings')}
            style={[s.settings, { borderColor: p.grid }]}
          >
            <Ionicons name="settings-outline" size={20} color={p.muted} />
            <Text style={{ color: p.text, flex: 1, fontSize: 14 }}>
              Settings & preferences
            </Text>
            <Ionicons name="chevron-forward" size={16} color={p.muted} />
          </Pressable>
        </ScrollView>
          </WorkspacePanel>
        </View>
      </Modal>
    </>
  );
}
export function CustomTabBar(props: BottomTabBarProps) {
  return <Dock {...props} />;
}
const s = StyleSheet.create({
  modalRoot: { flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingHorizontal: 12 },
  outer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingTop: 12,
  },
  shadow: {
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  dock: { padding: 6, borderRadius: 16 },
  tabs: { flexDirection: 'row' },
  tab: { minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 4 },
  label: { fontSize: 11, fontWeight: '600' },
  pillPosition: {
    position: 'absolute',
    left: 6,
    top: 6,
    height: 56,
    paddingHorizontal: 2,
  },
  pill: { flex: 1, borderRadius: 10, borderWidth: 1 },
  sheet: { paddingHorizontal: 24, paddingTop: 16 },
  eyebrow: { fontSize: 10, fontWeight: '600', letterSpacing: 1.8 },
  sheetTitle: {
    paddingRight: 28,
    fontSize: 25,
    fontWeight: '500',
    letterSpacing: -0.8,
    marginTop: 8,
    marginBottom: 24,
  },
  moreGrid: { justifyContent: 'space-between', flexDirection: 'row', flexWrap: 'wrap', rowGap: 12 },
  morePanel: { width: '47.8%', borderRadius: 14 },
  moreItem: { padding: 20, minHeight: 136 },
  moreLabel: { fontSize: 15, fontWeight: '600', marginTop: 15 },
  hint: { fontSize: 12, marginTop: 5 },
  moreArrow: {
    position: 'absolute',
    right: 16,
    top: 20,
    transform: [{ rotate: '45deg' }],
  },
  settings: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 20,
    borderTopWidth: 1,
    paddingTop: 12,
  },
});
