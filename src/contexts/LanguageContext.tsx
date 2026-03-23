import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

import { Onboarding, OnboardingLanguage } from '@/components/Onboarding';

const STORAGE_KEY_LANGUAGE = '@glow_language';

type LanguageContextValue = {
  language: OnboardingLanguage;
  setLanguage: (lang: OnboardingLanguage) => void;
};

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<OnboardingLanguage | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(STORAGE_KEY_LANGUAGE);
        if (stored === 'vi' || stored === 'en') {
          setLanguage(stored);
        } else {
          // Initialize with default language 'vi' if nothing stored
          setLanguage('vi');
        }
      } catch {
        // Initialize with default language 'vi' on error
        setLanguage('vi');
      }
    })();
  }, []);

  const handleSetLanguage = useCallback(async (lang: OnboardingLanguage) => {
    setLanguage(lang);
    try {
      await AsyncStorage.setItem(STORAGE_KEY_LANGUAGE, lang);
    } catch {
      // ignore
    }
  }, []);

  // Show Onboarding only before language is selected
  if (language === null) {
    return <Onboarding onComplete={handleSetLanguage} />;
  }

  // At this point, language is guaranteed to be 'vi' or 'en'
  const contextValue: LanguageContextValue = { language, setLanguage: handleSetLanguage };

  return (
    <LanguageContext.Provider value={contextValue}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error('useLanguage must be used within LanguageProvider');
  }
  return ctx;
}
