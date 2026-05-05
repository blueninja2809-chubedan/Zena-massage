import Feather from '@expo/vector-icons/Feather';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { VietnamProvincePickerContent } from '@/components/VietnamProvincePickerContent';
import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { persistHomeSelectedCity } from '@/lib/homeSelectedRegionStorage';
import { canUseAppFeatures } from '@/lib/session';

function paramString(v: string | string[] | undefined): string {
  if (v == null) {
    return '';
  }
  return Array.isArray(v) ? (v[0] ?? '') : v;
}

export default function SelectRegionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ current?: string | string[] }>();
  const { language } = useLanguage();
  const { user, setUser } = useUser();
  const isEn = language === 'en';

  const paramCity = useMemo(() => paramString(params.current), [params.current]);
  const fromProfile = user?.selectedCity || user?.workingCity || '';
  const highlightCity = paramCity || fromProfile;

  const title = isEn ? 'Select province/city' : 'Chọn tỉnh/thành phố';

  const applyCityFromGps = useCallback(
    async (city: string) => {
      await persistHomeSelectedCity(city);
      if (user && canUseAppFeatures(user)) {
        await setUser({ ...user, selectedCity: city });
      }
    },
    [setUser, user],
  );

  const onSelectCity = useCallback(
    async (city: string) => {
      await applyCityFromGps(city);
      router.back();
    },
    [router, applyCityFromGps],
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityRole="button"
          accessibilityLabel={isEn ? 'Back' : 'Quay lại'}
        >
          <Feather name="arrow-left" size={22} color={AppColors.text} />
        </TouchableOpacity>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.body}>
        <VietnamProvincePickerContent
          active
          selectedCity={highlightCity}
          onSelectCity={(city) => void onSelectCity(city)}
          onGpsAutoSelect={(city) => void applyCityFromGps(city)}
          isEn={isEn}
          accentColor={AppColors.primaryDark}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: AppColors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: AppColors.border,
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: AppColors.text,
  },
  headerSpacer: {
    width: 44,
  },
  body: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
  },
});
