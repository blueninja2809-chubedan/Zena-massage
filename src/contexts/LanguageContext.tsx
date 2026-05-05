import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import ZenaLoadingScreen from '@/components/animated-icon';
import { Onboarding, OnboardingLanguage } from '@/components/Onboarding';
import { AppColors } from '@/constants/appColors';
import { scheduleHideNativeBootSplash } from '@/lib/nativeBootSplash';

const STORAGE_KEY_LANGUAGE = '@zena_language';
const LEGACY_STORAGE_KEY_LANGUAGE = '@glow_language';
/** Chỉ thiếu khi chưa bao giờ hoàn tất màn chọn ngôn ngữ (cài mới lần đầu). */
const STORAGE_LANGUAGE_PICK_DONE = '@zena_language_pick_done';

type LanguageContextValue = {
  language: OnboardingLanguage;
  setLanguage: (lang: OnboardingLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<OnboardingLanguage | null>(null);
  const [languageHydrated, setLanguageHydrated] = useState(false);
  /** Lần đầu cài: sau Lottie intro mới hiện màn chọn ngôn ngữ. */
  const [firstInstallIntroDone, setFirstInstallIntroDone] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const pickDone = await AsyncStorage.getItem(STORAGE_LANGUAGE_PICK_DONE);
        let stored = await AsyncStorage.getItem(STORAGE_KEY_LANGUAGE);
        if (!stored) {
          stored = await AsyncStorage.getItem(LEGACY_STORAGE_KEY_LANGUAGE);
          if (stored === 'vi' || stored === 'en') {
            await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, stored);
            await AsyncStorage.removeItem(LEGACY_STORAGE_KEY_LANGUAGE);
          }
        }

        if (pickDone === '1') {
          // Đã chọn ngôn ngữ ít nhất một lần — không bao giờ hiện lại màn chọn
          if (stored === 'vi' || stored === 'en') {
            setLanguage(stored);
          } else {
            setLanguage('vi');
            await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, 'vi').catch(() => {});
          }
        } else if (stored === 'vi' || stored === 'en') {
          // Bản cũ đã có ngôn ngữ nhưng chưa có cờ: coi như đã xong một lần
          await AsyncStorage.setItem(STORAGE_LANGUAGE_PICK_DONE, '1').catch(() => {});
          setLanguage(stored);
        } else {
          // Cài mới thật sự: chưa có ngôn ngữ → loading → màn chọn (một lần)
          setLanguage(null);
        }
      } catch {
        setLanguage('vi');
        await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, 'vi').catch(() => {});
        await AsyncStorage.setItem(STORAGE_LANGUAGE_PICK_DONE, '1').catch(() => {});
      } finally {
        setLanguageHydrated(true);
      }
    })();
  }, []);

  useLayoutEffect(() => {
    if (!languageHydrated) return;
    scheduleHideNativeBootSplash();
  }, [languageHydrated]);

  const handleSetLanguage = useCallback(async (lang: OnboardingLanguage) => {
    setLanguage(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, lang);
      await AsyncStorage.setItem(STORAGE_LANGUAGE_PICK_DONE, '1');
    } catch {
      // ignore
    }
  }, []);

  if (!languageHydrated) {
    return <View style={langBootstrap.fill} />;
  }

  // Lần đầu mở app (chưa có ngôn ngữ đã lưu): loading Lottie một lần → màn chọn ngôn ngữ
  if (language === null && !firstInstallIntroDone) {
    return (
      <ZenaLoadingScreen
        readyToDismiss
        onDismissed={() => setFirstInstallIntroDone(true)}
      />
    );
  }

  if (language === null) {
    return <Onboarding onComplete={handleSetLanguage} />;
  }

  const contextValue: LanguageContextValue = { language, setLanguage: handleSetLanguage };

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

const langBootstrap = StyleSheet.create({
  fill: { flex: 1, backgroundColor: AppColors.bg },
});

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
