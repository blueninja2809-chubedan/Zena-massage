import { useMemo } from 'react';
import { Platform, useWindowDimensions, type ViewStyle } from 'react-native';

type TabletLayout = {
  isTablet: boolean;
  horizontalPadding: number;
  contentContainer: ViewStyle;
};

export function useTabletLayout(): TabletLayout {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const shortestSide = Math.min(width, height);
    const isTablet = shortestSide >= 768;
    const horizontalPadding = isTablet ? (Platform.OS === 'ios' ? 28 : 24) : 16;

    return {
      isTablet,
      horizontalPadding,
      contentContainer: {
        width: '100%',
        maxWidth: isTablet ? 980 : '100%',
        alignSelf: 'center',
      },
    };
  }, [height, width]);
}
