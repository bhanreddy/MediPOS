import React from 'react';
import { View, Pressable, TextInput, StyleSheet, useWindowDimensions, type TextInputProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTheme } from '@/hooks/useTheme';
import { mobileLayout } from '@/theme/mobileLayout';
import { AppText as Text } from './AppText';

type Icon = keyof typeof Ionicons.glyphMap;

export function WorkspaceIconButton({ icon, label, onPress, badge, disabled = false }: { icon: Icon; label: string; onPress: () => void; badge?: number; disabled?: boolean }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityHint={badge ? `${badge} items` : undefined} accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.iconButton, { borderColor: theme.colors.border, backgroundColor: pressed ? theme.colors.primaryLight : theme.colors.surface, opacity: disabled ? .5 : 1 }]}>
    <Ionicons name={icon} size={20} color={theme.colors.primary} />
    {!!badge && <View style={[styles.badge, { backgroundColor: theme.colors.danger }]}><Text style={{ color: theme.colors.text.inverse, fontSize: 9, fontWeight: '700' }}>{badge > 99 ? '99+' : badge}</Text></View>}
  </Pressable>;
}

export function WorkspaceHeader({ title, subtitle, icon = 'medical-outline', onBack, close = false, actions, children, safeArea = false }: {
  title: string; subtitle?: string; icon?: Icon; onBack?: () => void; close?: boolean; actions?: React.ReactNode; children?: React.ReactNode; safeArea?: boolean;
}) {
  const { theme, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  return <View style={{ backgroundColor: theme.colors.background, borderBottomWidth: 1, borderColor: theme.colors.border, paddingTop: safeArea ? insets.top : 0 }}>
    <StatusBar style={isDark ? 'light' : 'dark'} />
    <View style={styles.header}>
      {onBack ? <WorkspaceIconButton icon={close ? 'close' : 'arrow-back'} label={close ? 'Close screen' : 'Go back'} onPress={onBack} /> :
        <View style={[styles.headerIcon, { backgroundColor: theme.colors.primaryLight }]}><Ionicons name={icon} size={23} color={theme.colors.primary} /></View>}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>NEXSYRUS</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        {!!subtitle && <Text style={[styles.subtitle, { color: theme.colors.text.secondary }]}>{subtitle}</Text>}
      </View>
      {actions && <View style={styles.actions}>{actions}</View>}
    </View>
    {children && <View style={styles.toolbar}>{children}</View>}
  </View>;
}

export function WorkspaceSearch({ label, trailing, ...props }: TextInputProps & { label: string; trailing?: React.ReactNode }) {
  const { theme } = useTheme();
  return <View style={[styles.search, { backgroundColor: theme.colors.primaryLight, borderColor: theme.colors.border }]}>
    <Ionicons name="search-outline" size={18} color={theme.colors.text.secondary} />
    <TextInput {...props} accessibilityLabel={label} placeholder={props.placeholder ?? label} placeholderTextColor={theme.colors.text.secondary}
      style={[styles.searchInput, { color: theme.colors.text.primary, fontFamily: theme.typography.family.regular }, props.style]} />
    {!!props.value && props.onChangeText && <Pressable accessibilityRole="button" accessibilityLabel={`Clear ${label.toLowerCase()}`} onPress={() => props.onChangeText?.('')} style={styles.searchClear}><Ionicons name="close-circle" size={18} color={theme.colors.text.secondary} /></Pressable>}
    {trailing}
  </View>;
}

export function WorkspaceChip({ label, selected = false, onPress, role = 'button' }: { label: string; selected?: boolean; onPress: () => void; role?: 'button' | 'tab' }) {
  const { theme } = useTheme();
  return <Pressable accessibilityRole={role} accessibilityLabel={label} accessibilityState={{ selected }} onPress={onPress}
    style={({ pressed }) => [styles.chip, { borderColor: selected ? theme.colors.primary : theme.colors.border, backgroundColor: selected ? theme.colors.primary : pressed ? theme.colors.primaryLight : theme.colors.surface }]}>
    <Text style={{ fontSize: 12, fontWeight: selected ? '600' : '500', color: selected ? theme.colors.text.inverse : theme.colors.text.secondary }}>{label}</Text>
  </Pressable>;
}

export function WorkspaceCard({ style, ...props }: ViewProps) {
  const { theme } = useTheme();
  return <View {...props} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }, style, { borderWidth: 1, borderRadius: theme.radius.card, shadowOpacity: 0, elevation: 0 }]} />;
}

export function WorkspaceEmpty({ title, description, icon = 'file-tray-outline' }: { title: string; description?: string; icon?: Icon }) {
  const { theme } = useTheme();
  return <View style={styles.empty}><View style={[styles.emptyIcon, { backgroundColor: theme.colors.primaryLight }]}><Ionicons name={icon} size={25} color={theme.colors.primary} /></View>
    <Text style={{ fontSize: 15, fontWeight: '600', textAlign: 'center' }}>{title}</Text>
    {!!description && <Text style={{ color: theme.colors.text.secondary, fontSize: 12, lineHeight: 19, textAlign: 'center', maxWidth: 280 }}>{description}</Text>}
  </View>;
}

export function WorkspaceFab({ label, onPress, bottom = 24 }: { label: string; onPress: () => void; bottom?: number }) {
  const { theme } = useTheme();
  const { width, fontScale } = useWindowDimensions();
  const { gutter } = mobileLayout(width, fontScale);
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={({ pressed }) => [styles.fab, { right: gutter, bottom, backgroundColor: theme.colors.primary, opacity: pressed ? .85 : 1 }]}><Ionicons name="add" size={25} color={theme.colors.text.inverse} /></Pressable>;
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 16, minHeight: 82 },
  headerIcon: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center' },
  iconButton: { width: 44, minHeight: 44, borderRadius: 12, borderWidth: 1, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', top: -4, right: -4, minWidth: 17, minHeight: 17, paddingHorizontal: 4, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { fontSize: 8, fontWeight: '700', letterSpacing: 1.3, marginBottom: 4 },
  title: { fontSize: 22, lineHeight: 29, fontWeight: '700', letterSpacing: -.6 },
  subtitle: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  toolbar: { paddingHorizontal: 16, paddingBottom: 14, gap: 12 },
  search: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 9, borderWidth: 1, borderRadius: 12, paddingLeft: 12 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 44, fontSize: 13, paddingVertical: 10 },
  searchClear: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  chip: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  card: { padding: 16, borderWidth: 1, borderRadius: 16 },
  empty: { paddingHorizontal: 24, paddingVertical: 28, alignItems: 'center', gap: 9 },
  emptyIcon: { width: 50, height: 50, borderRadius: 16, alignItems: 'center', justifyContent: 'center', marginBottom: 3 },
  fab: { position: 'absolute', width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center' },
});
