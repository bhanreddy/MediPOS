import React, { useCallback, useMemo, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import GorhomBottomSheet, { BottomSheetBackdrop } from '@gorhom/bottom-sheet';
import { useTheme } from '@/hooks/useTheme';

export interface BottomSheetProps {
  children: React.ReactNode;
  snapPoints?: string[];
  title?: string;
  onClose?: () => void;
}

export const BottomSheet = React.forwardRef<GorhomBottomSheet, BottomSheetProps>(
  ({ children, snapPoints = ['50%', '90%'], title, onClose }, ref) => {
    const { theme } = useTheme();

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      ),
      []
    );

    return (
      <GorhomBottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        /* Dynamic sizing defaults to true in v5 and breaks fixed snapPoints + snapToIndex/expand from a closed sheet */
        enableDynamicSizing={false}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        onClose={onClose}
        handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
        backgroundStyle={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.modal }}
      >
        <View style={styles.contentContainer}>
          {title && <Text style={[styles.title, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, fontSize: theme.typography.size.lg }]}>{title}</Text>}
          {children}
        </View>
      </GorhomBottomSheet>
    );
  }
);

BottomSheet.displayName = 'BottomSheet';

const styles = StyleSheet.create({
  contentContainer: {
    flex: 1,
    padding: 16,
  },
  title: {
    marginBottom: 16,
    textAlign: 'center',
  },
});
