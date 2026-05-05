import { AppColors } from '@/constants/appColors';
import { SplashLotusLottie } from '@/components/SplashLotusLottie';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

const yogaLotusFlower = require('@/assets/lottie/yoga-lotus-flower.json') as {
  fr?: number;
  op?: number;
};

/** Thời lượng một lần chạy từ Lottie meta (`op`/`fr`). */
const LOTUS_ONE_SHOT_MS = Math.ceil(
  ((Number(yogaLotusFlower.op) || 40) / (Number(yogaLotusFlower.fr) || 10)) * 1000,
);

/** Tối thiểu hiển thị màn loading (ms). */
const MIN_VISIBLE_MS = 2400;

const LOADING_LABEL = 'Đang tải, vui lòng chờ';

export type AnimatedSplashOverlayProps = {
  /** Splash in-app: tự ẩn sau N ms (không dùng chung với `onDismissed`). */
  autoDismissMs?: number | null;
  /**
   * Khi có `onDismissed`: `true` = dữ liệu xong; chỉ gọi callback sau khi **hết một vòng Lottie**
   * và đã hiển thị tối thiểu `MIN_VISIBLE_MS` kể từ lúc mở màn.
   */
  readyToDismiss?: boolean;
  onDismissed?: () => void;
};

export type ZenaLoadingScreenProps = Pick<AnimatedSplashOverlayProps, 'readyToDismiss' | 'onDismissed'>;

export function AnimatedSplashOverlay({
  autoDismissMs = null,
  readyToDismiss = false,
  onDismissed,
}: AnimatedSplashOverlayProps) {
  const [visible, setVisible] = useState(true);
  const dotOpacity1 = useSharedValue(0.3);
  const dotOpacity2 = useSharedValue(0.3);
  const dotOpacity3 = useSharedValue(0.3);

  const gate = typeof onDismissed === 'function';
  const openedAtRef = useRef(Date.now());
  const [animFinished, setAnimFinished] = useState(false);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  const handleAnimFinish = useCallback(() => {
    setAnimFinished(true);
  }, []);

  useEffect(() => {
    const animateDot = (sv: SharedValue<number>, delay: number) => {
      setTimeout(() => {
        sv.value = withRepeat(
          withSequence(withTiming(1, { duration: 400 }), withTiming(0.3, { duration: 400 })),
          -1,
          true,
        );
      }, delay);
    };
    animateDot(dotOpacity1, 0);
    animateDot(dotOpacity2, 200);
    animateDot(dotOpacity3, 400);

    if (!gate && autoDismissMs != null && autoDismissMs > 0) {
      const timer = setTimeout(() => setVisible(false), autoDismissMs);
      return () => clearTimeout(timer);
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gate, autoDismissMs]);

  useEffect(() => {
    if (!gate) return;
    const t = setTimeout(() => setAnimFinished(true), LOTUS_ONE_SHOT_MS + 2000);
    return () => clearTimeout(t);
  }, [gate]);

  useEffect(() => {
    if (!gate) return;
    if (!(readyToDismiss && animFinished)) return;
    const elapsed = Date.now() - openedAtRef.current;
    const delay = Math.max(0, MIN_VISIBLE_MS - elapsed);
    const t = setTimeout(() => {
      onDismissedRef.current?.();
    }, delay);
    return () => clearTimeout(t);
  }, [gate, readyToDismiss, animFinished]);

  const dot1Style = useAnimatedStyle(() => ({ opacity: dotOpacity1.value }));
  const dot2Style = useAnimatedStyle(() => ({ opacity: dotOpacity2.value }));
  const dot3Style = useAnimatedStyle(() => ({ opacity: dotOpacity3.value }));

  if (!visible) return null;

  return (
    <Animated.View exiting={FadeOut.duration(500)} style={splashStyles.container}>
      <Animated.View entering={FadeIn.duration(500).delay(120)} style={splashStyles.lottieWrap}>
        <SplashLotusLottie
          key={gate ? 'gated' : 'loop'}
          animationData={yogaLotusFlower as Record<string, unknown>}
          autoPlay
          loop={!gate}
          onAnimationFinish={gate ? handleAnimFinish : undefined}
          style={splashStyles.lottie}
        />
      </Animated.View>

      <Animated.View entering={FadeIn.duration(500).delay(400)} style={splashStyles.loadingArea}>
        <View style={splashStyles.dotsRow}>
          <Animated.View style={[splashStyles.dot, dot1Style]} />
          <Animated.View style={[splashStyles.dot, dot2Style]} />
          <Animated.View style={[splashStyles.dot, dot3Style]} />
        </View>
        <Text style={splashStyles.loadingText}>{LOADING_LABEL}</Text>
      </Animated.View>
    </Animated.View>
  );
}

const splashStyles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: AppColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottieWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: 280,
    height: 280,
  },
  loadingArea: {
    alignItems: 'center',
    position: 'absolute',
    bottom: 100,
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
    backgroundColor: AppColors.accent,
  },
  loadingText: {
    fontSize: 14,
    color: AppColors.primaryDark,
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
    backgroundColor: AppColors.primaryDark,
    width: 128,
    height: 128,
    position: 'absolute',
  },
});

export default function ZenaLoadingScreen({ readyToDismiss, onDismissed }: ZenaLoadingScreenProps) {
  return <AnimatedSplashOverlay readyToDismiss={readyToDismiss} onDismissed={onDismissed} />;
}
