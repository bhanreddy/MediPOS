import React from 'react';
import { View, useWindowDimensions } from 'react-native';
import { mobileLayout } from '@/theme/mobileLayout';

/** Group related fields or sections without stretching a single column on tablets. */
export function ResponsiveGrid({ children, columns = 2 }: { children: React.ReactNode; columns?: 2 | 3 }) {
  const { width, fontScale } = useWindowDimensions();
  const layout = mobileLayout(width, fontScale);
  const count = layout.wide ? (columns === 3 && width / Math.max(1, fontScale) >= 1000 ? 3 : 2) : 1;
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -6 }}>
      {React.Children.toArray(children).map((child, index) => (
        <View key={React.isValidElement(child) && child.key != null ? child.key : index}
          style={{ width: `${100 / count}%`, paddingHorizontal: 6, minWidth: 0 }}>
          {child}
        </View>
      ))}
    </View>
  );
}
