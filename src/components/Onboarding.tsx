import { AppColors } from '@/constants/appColors';
import React from 'react';
import {
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

export type OnboardingLanguage = 'en' | 'vi';

export type OnboardingProps = {
  onComplete: (language: OnboardingLanguage) => void;
};

const strings: Record<OnboardingLanguage, { title: string; subtitle: string; languageTitle: string; languageDesc: string }> = {
  vi: {
    title: 'Chào mừng đến với Glow',
    subtitle: 'Đăng ký để trải nghiệm dịch vụ tốt nhất',
    languageTitle: 'Chọn ngôn ngữ',
    languageDesc: 'Bạn muốn dùng Glow bằng ngôn ngữ nào?',
  },
  en: {
    title: 'Welcome to Glow',
    subtitle: 'Register to enjoy the best service',
    languageTitle: 'Choose your language',
    languageDesc: 'Which language would you like to use?',
  },
};

export function Onboarding({ onComplete }: OnboardingProps) {
  const currentStrings = strings.vi;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{currentStrings.title}</Text>
      <Text style={styles.subtitle}>{currentStrings.subtitle}</Text>

      <View style={styles.stepCard}>
        <Text style={styles.stepTitle}>{currentStrings.languageTitle}</Text>
        <Text style={styles.stepDescription}>{currentStrings.languageDesc}</Text>

        <View style={styles.languageRow}>
          <TouchableOpacity
            style={styles.languageButton}
            onPress={() => onComplete('vi')}>
            <Text style={styles.languageButtonText}>Tiếng Việt</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.languageButton}
            onPress={() => onComplete('en')}>
            <Text style={styles.languageButtonText}>English</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 22,
    justifyContent: 'center',
    backgroundColor: AppColors.bg,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: AppColors.text,
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 15,
    color: AppColors.textMuted,
    marginBottom: 30,
  },
  stepCard: {
    backgroundColor: AppColors.white,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: AppColors.border,
  },
  stepTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: AppColors.text,
    marginBottom: 8,
  },
  stepDescription: {
    fontSize: 14,
    color: AppColors.textMuted,
    marginBottom: 20,
    lineHeight: 20,
  },
  languageRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  languageButton: {
    flex: 1,
    backgroundColor: AppColors.primarySoft,
    borderWidth: 1,
    borderColor: AppColors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
  },
  languageButtonText: {
    fontSize: 15,
    fontWeight: '700',
    color: AppColors.primaryDark,
  },
});
