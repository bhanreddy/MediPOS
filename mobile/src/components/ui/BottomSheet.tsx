import { AppText as Text } from '@/components/ui/AppText';
import React, { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import GorhomBottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { LiquidPanel, useGlassPreferences } from '@/components/glass/LiquidGlass';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/hooks/useTheme';

export interface BottomSheetProps {
  children: React.ReactNode;
  snapPoints?: string[];
  title?: string;
  onClose?: () => void;
}

export const BottomSheet = React.forwardRef<GorhomBottomSheet, BottomSheetProps>(
  ({ children, snapPoints = ['50%', '90%'], title, onClose }, ref) => {
    const insets = useSafeAreaInsets();
    const { theme, isDark } = useTheme();
    const { reduceMotion } = useGlassPreferences();
    const renderBackground = useCallback((props: { style?: import('react-native').StyleProp<import('react-native').ViewStyle> }) => (
      <LiquidPanel dark={isDark} material="chrome" style={[props.style, { borderRadius: theme.radius.modal }]} />
    ), [isDark, theme.radius.modal]);
    const [isOpen, setIsOpen] = useState(false);

    const renderBackdrop = useCallback(
      (props: any) => (
        <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
      ),
      []
    );

    const handleClose = useCallback(() => {
      setIsOpen(false);
      onClose?.();
    }, [onClose]);

    const handleAnimate = useCallback((_from: number, to: number) => {
      setIsOpen(to >= 0);
    }, []);

    return (
      <View
        pointerEvents={isOpen ? 'auto' : 'none'}
        style={StyleSheet.absoluteFill}
      >
        <GorhomBottomSheet
          ref={ref}
          index={-1}
          snapPoints={snapPoints}
          /* Dynamic sizing defaults to true in v5 and breaks fixed snapPoints + snapToIndex/expand from a closed sheet */
          enableDynamicSizing={false}
          enablePanDownToClose
          topInset={insets.top}
          keyboardBehavior="interactive"
          keyboardBlurBehavior="restore"
          android_keyboardInputMode="adjustResize"
          backdropComponent={renderBackdrop}
          backgroundComponent={renderBackground}
          animateOnMount={!reduceMotion}
          onClose={handleClose}
          onAnimate={handleAnimate}
          handleIndicatorStyle={{ backgroundColor: theme.colors.border }}
          backgroundStyle={{ backgroundColor: theme.colors.surface, borderRadius: theme.radius.modal }}
        >
          <BottomSheetView style={[styles.contentContainer, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            {title && <Text style={[styles.title, { color: theme.colors.text.primary, fontFamily: theme.typography.family.semiBold, fontSize: theme.typography.size.lg }]}>{title}</Text>}
            {children}
          </BottomSheetView>
        </GorhomBottomSheet>
      </View>
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

