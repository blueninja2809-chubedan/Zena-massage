import { AppColors } from '@/constants/appColors';
import { Image } from 'expo-image';
import Lottie from 'lottie-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, Keyframe } from 'react-native-reanimated';

import classes from './animated-icon.module.css';

const yogaLotusFlower = require('@/assets/lottie/yoga-lotus-flower.json') as {
  fr?: number;
  op?: number;
};
const LOTUS_ONE_SHOT_MS = Math.ceil(
  ((Number(yogaLotusFlower.op) || 40) / (Number(yogaLotusFlower.fr) || 10)) * 1000,
);
const MIN_VISIBLE_MS = 2400;
const LOADING_LABEL = 'Đang tải, vui lòng chờ nhé';
const DURATION = 200;

export type AnimatedSplashOverlayProps = {
  autoDismissMs?: number | null;
  readyToDismiss?: boolean;
  onDismissed?: () => void;
};

export type ZenaLoadingScreenProps = Pick<AnimatedSplashOverlayProps, 'readyToDismiss' | 'onDismissed'>;

const webSplashStyles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: AppColors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lottie: {
    width: 280,
    height: 280,
  },
  footer: {
    position: 'absolute',
    bottom: 100,
    alignItems: 'center',
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

export function AnimatedSplashOverlay({
  autoDismissMs = null,
  readyToDismiss = false,
  onDismissed,
}: AnimatedSplashOverlayProps) {
  const gate = typeof onDismissed === 'function';
  const openedAtRef = useRef(Date.now());
  const [animFinished, setAnimFinished] = useState(false);
  const onDismissedRef = useRef(onDismissed);
  onDismissedRef.current = onDismissed;

  const handleAnimFinish = useCallback(() => setAnimFinished(true), []);

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
    const t = setTimeout(() => onDismissedRef.current?.(), delay);
    return () => clearTimeout(t);
  }, [gate, readyToDismiss, animFinished]);

  return (
    <View style={webSplashStyles.container} pointerEvents="auto">
      <Lottie
        animationData={yogaLotusFlower}
        autoplay
        loop={!gate}
        {...(gate
          ? { onComplete: () => handleAnimFinish() }
          : {})}
        style={{
          width: webSplashStyles.lottie.width as number,
          height: webSplashStyles.lottie.height as number,
        }}
      />
      <View style={webSplashStyles.footer}>
        <View style={webSplashStyles.dotsRow}>
          <View style={webSplashStyles.dot} />
          <View style={webSplashStyles.dot} />
          <View style={webSplashStyles.dot} />
        </View>
        <Text style={webSplashStyles.loadingText}>{LOADING_LABEL}</Text>
      </View>
    </View>
  );
}

export default function ZenaLoadingScreen(props: ZenaLoadingScreenProps) {
  return <AnimatedSplashOverlay {...props} />;
}

const keyframe = new Keyframe({
  0: {
    transform: [{ scale: 0 }],
  },
  60: {
    transform: [{ scale: 1.2 }],
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    easing: Easing.elastic(1.2),
  },
});

const logoKeyframe = new Keyframe({
  0: {
    opacity: 0,
  },
  60: {
    transform: [{ scale: 1.2 }],
    opacity: 0,
    easing: Easing.elastic(1.2),
  },
  100: {
    transform: [{ scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(1.2),
  },
});

const zenaLogoRingKeyframe = new Keyframe({
  0: {
    transform: [{ rotateZ: '-180deg' }, { scale: 0.8 }],
    opacity: 0,
  },
  [DURATION / 1000]: {
    transform: [{ rotateZ: '0deg' }, { scale: 1 }],
    opacity: 1,
    easing: Easing.elastic(0.7),
  },
  100: {
    transform: [{ rotateZ: '7200deg' }],
  },
});

export function AnimatedIcon() {
  return (
    <View style={styles.iconContainer}>
      <Animated.View entering={zenaLogoRingKeyframe.duration(60 * 1000 * 4)} style={styles.zenaLogoRing}>
        <Image style={styles.zenaLogoRing} source={require('@/assets/images/logo-zena-ring.png')} />
      </Animated.View>

      <Animated.View style={styles.background} entering={keyframe.duration(DURATION)}>
        <div className={classes.expoLogoBackground} />
      </Animated.View>

      <Animated.View style={styles.imageContainer} entering={logoKeyframe.duration(DURATION)}>
        <Image style={styles.image} source={require('@/assets/images/expo-logo.png')} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    width: '100%',
    zIndex: 1000,
    position: 'absolute',
    top: 128 / 2 + 138,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  zenaLogoRing: {
    width: 201,
    height: 201,
    position: 'absolute',
  },
  iconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 128,
    height: 128,
  },
  image: {
    position: 'absolute',
    width: 76,
    height: 71,
  },
  background: {
    width: 128,
    height: 128,
    position: 'absolute',
  },
});
