import { AppColors } from '@/constants/appColors';
import { LinearGradient } from 'expo-linear-gradient';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type OnboardingLanguage = 'en' | 'vi';

export type OnboardingProps = {
  onComplete: (language: OnboardingLanguage) => void;
};

export function Onboarding({ onComplete }: OnboardingProps) {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[AppColors.accentSoft, AppColors.primarySoft2, AppColors.bg]}
      locations={[0, 0.38, 1]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.root}
    >
      <View style={[styles.inner, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 28 }]}>
        <Animated.View entering={FadeIn.duration(480)} style={styles.header}>
          <Text style={styles.title}>Chọn ngôn ngữ</Text>
        </Animated.View>

        <View style={styles.cards}>
          <Animated.View entering={FadeInDown.duration(440).delay(70)}>
            <Pressable
              onPress={() => onComplete('vi')}
              style={({ pressed }) => [styles.cardOuter, pressed && styles.cardPressed]}
              android_ripple={{ color: 'rgba(124, 106, 91, 0.12)' }}
            >
              <LinearGradient
                colors={['#FFFCF8', AppColors.white, AppColors.primarySoft2]}
                locations={[0, 0.45, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.flag} allowFontScaling={false}>
                    🇻🇳
                  </Text>
                  <Text style={styles.cardLabel}>Tiếng Việt</Text>
                </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(440).delay(150)}>
            <Pressable
              onPress={() => onComplete('en')}
              style={({ pressed }) => [styles.cardOuter, pressed && styles.cardPressed]}
              android_ripple={{ color: 'rgba(124, 106, 91, 0.12)' }}
            >
              <LinearGradient
                colors={['#FFFCF8', AppColors.white, '#EEF3F8']}
                locations={[0, 0.5, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.cardGradient}
              >
                <View style={styles.cardRow}>
                  <Text style={styles.flag} allowFontScaling={false}>
                    🇬🇧
                  </Text>
                  <Text style={styles.cardLabel}>English</Text>
                </View>
              </LinearGradient>
            </Pressable>
          </Animated.View>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  inner: {
    flex: 1,
    paddingHorizontal: 26,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: AppColors.text,
    letterSpacing: -0.3,
    textShadowColor: 'rgba(255, 255, 255, 0.75)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  cards: {
    gap: 16,
  },
  cardOuter: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(156, 107, 63, 0.22)',
    shadowColor: '#2F241C',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 8,
  },
  cardPressed: {
    transform: [{ scale: 0.985 }],
    opacity: 0.96,
  },
  cardGradient: {
    paddingVertical: 20,
    paddingHorizontal: 22,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  flag: {
    fontSize: 36,
    lineHeight: 42,
  },
  cardLabel: {
    fontSize: 19,
    fontWeight: '700',
    color: AppColors.primaryDark,
    letterSpacing: -0.2,
  },
});
