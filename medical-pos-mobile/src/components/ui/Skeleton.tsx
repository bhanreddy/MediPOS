import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolateColor,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';

/* ─── Base Skeleton ─────────────────────────────────── */

interface SkeletonProps {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: any;
}

export function Skeleton({ width, height, borderRadius = 8, style }: SkeletonProps) {
  const { theme, isDark } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: 1200, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, []);

  const baseColor = isDark ? '#1A2C3E' : '#E8ECF0';
  const highlightColor = isDark ? '#243B53' : '#F5F7FA';

  const animatedStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], [baseColor, highlightColor]),
  }));

  return (
    <Animated.View
      style={[{ width: width as any, height, borderRadius }, animatedStyle, style]}
    />
  );
}

/* ─── Screen-Specific Skeletons ─────────────────────── */

export function DashboardSkeleton() {
  return (
    <View style={sk.container}>
      {/* KPI Row */}
      <View style={sk.row}>
        <Skeleton width="48%" height={90} borderRadius={16} />
        <Skeleton width="48%" height={90} borderRadius={16} />
      </View>
      <View style={sk.row}>
        <Skeleton width="48%" height={90} borderRadius={16} />
        <Skeleton width="48%" height={90} borderRadius={16} />
      </View>
      {/* Chart */}
      <Skeleton width="100%" height={200} borderRadius={16} style={{ marginTop: 16 }} />
      {/* List Items */}
      {[1, 2, 3].map(i => (
        <View key={i} style={sk.listRow}>
          <Skeleton width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton width="70%" height={14} borderRadius={4} />
            <Skeleton width="40%" height={10} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
          <Skeleton width={60} height={18} borderRadius={4} />
        </View>
      ))}
    </View>
  );
}

export function MedicineListSkeleton() {
  return (
    <View style={sk.container}>
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={sk.card}>
          <Skeleton width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton width="65%" height={14} borderRadius={4} />
            <Skeleton width="40%" height={10} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Skeleton width={50} height={14} borderRadius={4} />
            <Skeleton width={30} height={10} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

export function PatientListSkeleton() {
  return (
    <View style={sk.container}>
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={sk.card}>
          <Skeleton width={52} height={52} borderRadius={26} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Skeleton width="55%" height={14} borderRadius={4} />
            <Skeleton width="35%" height={10} borderRadius={4} style={{ marginTop: 6 }} />
            <Skeleton width="25%" height={10} borderRadius={4} style={{ marginTop: 6 }} />
          </View>
          <Skeleton width={70} height={28} borderRadius={14} />
        </View>
      ))}
    </View>
  );
}

export function SaleListSkeleton() {
  return (
    <View style={sk.container}>
      {[1, 2, 3, 4, 5].map(i => (
        <View key={i} style={[sk.card, { borderLeftWidth: 4, borderLeftColor: '#E8ECF0' }]}>
          <View style={{ flex: 1 }}>
            <Skeleton width="45%" height={14} borderRadius={4} />
            <Skeleton width="60%" height={10} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Skeleton width={70} height={16} borderRadius={4} />
            <Skeleton width={40} height={10} borderRadius={4} style={{ marginTop: 8 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  container: { padding: 16 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    marginBottom: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
});
