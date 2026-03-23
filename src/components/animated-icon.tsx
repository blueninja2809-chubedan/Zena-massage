import { useEffect, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import Animated, {
    Easing,
    FadeIn,
    FadeOut,
    Keyframe,
    SharedValue,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withSequence,
    withTiming,
} from 'react-native-reanimated';

const SPLASH_DISPLAY_MS = 2400;

export function AnimatedSplashOverlay() {
  const [visible, setVisible] = useState(true);
  const scale = useSharedValue(0.8);
  const dotOpacity1 = useSharedValue(0.3);
  const dotOpacity2 = useSharedValue(0.3);
  const dotOpacity3 = useSharedValue(0.3);

  useEffect(() => {
    // Logo scale-in animation
    scale.value = withTiming(1, { duration: 600, easing: Easing.out(Easing.ease) });

    // Dot loading animation (sequential)
    const animateDot = (sv: SharedValue<number>, delay: number) => {
      setTimeout(() => {
        sv.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 400 }),
            withTiming(0.3, { duration: 400 }),
          ),
          -1,
          true,
        );
      }, delay);
    };
    animateDot(dotOpacity1, 0);
    animateDot(dotOpacity2, 200);
    animateDot(dotOpacity3, 400);

    // Hide after delay
    const timer = setTimeout(() => setVisible(false), SPLASH_DISPLAY_MS);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logoStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const dot1Style = useAnimatedStyle(() => ({ opacity: dotOpacity1.value }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: dotOpacity2.value }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: dotOpacity3.value }));

  if (!visible) return null;

  return (
    <Animated.View
      exiting={FadeOut.duration(500)}
      style={splashStyles.container}
    >
      {/* ZENA Logo */}
      <Animated.View entering={FadeIn.duration(600).delay(200)} style={[splashStyles.logoArea, logoStyle]}>
        <Image
          source={require('@/assets/images/zena-logo.png')}
          style={splashStyles.logoImage}
          resizeMode="contain"
        />
      </Animated.View>

      {/* Loading area */}
      <Animated.View entering={FadeIn.duration(500).delay(600)} style={splashStyles.loadingArea}>
        <View style={splashStyles.dotsRow}>
          <Animated.View style={[splashStyles.dot, dot1Style]} />
          <Animated.View style={[splashStyles.dot, dot2Style]} />
          <Animated.View style={[splashStyles.dot, dot3Style]} />
        </View>
        <Text style={splashStyles.loadingText}>Đang tải, vui lòng chờ...</Text>
      </Animated.View>
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#FFFFFF',
    zIndex: 1000,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoImage: {
    width: 1000,
    height: 440,
  },
  loadingArea: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 120,
    gap: 14,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#90CAF9',
  },
  loadingText: {
    fontSize: 14,
    color: '#90CAF9',
    fontWeight: '500',
  },
});

const ICON_DURATION = 600;

const iconBgKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

const iconLogoKeyframe = new Keyframe({
  0: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
  },
  40: {
    transform: [{ scale: 1.3 }],
    opacity: 0,
    easing: Easing.elastic(0.7),
  },
  100: {
    opacity: 1,
    transform: [{ scale: 1 }],
    easing: Easing.elastic(0.7),
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={iconBgKeyframe.duration(ICON_DURATION)} style={styles.background} />
      <Animated.View style={styles.imageContainer} entering={iconLogoKeyframe.duration(ICON_DURATION)}>
        <Text style={styles.iconEmoji}>💆‍♀️</Text>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
    zIndex: 100,
  },
  iconEmoji: {
    fontSize: 48,
  },
  background: {
    borderRadius: 40,
    backgroundColor: '#2196F3',
    width: 128,
    height: 128,
    position: 'absolute',
  },
});
