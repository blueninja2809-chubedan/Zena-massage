import Feather from '@expo/vector-icons/Feather';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useColorScheme } from 'react-native';

import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';

const TAB_COLORS = {
  light: {
    background: '#FFFBFB',
    iconDefault: '#4B5563',
    iconSelected: '#E53935',
    textDefault: '#4B5563',
    textSelected: '#E53935',
  },
  dark: {
    background: '#1A1212',
    iconDefault: '#A18888',
    iconSelected: '#FF8A80',
    textDefault: '#A18888',
    textSelected: '#FFAB91',
  },
} as const;

type TabPalette = (typeof TAB_COLORS)[keyof typeof TAB_COLORS];

function CustomerTabs({ palette, isEn }: { palette: TabPalette; isEn: boolean }) {
  return (
    <NativeTabs
      backgroundColor={palette.background}
      disableIndicator
      indicatorColor="transparent"
      rippleColor="transparent"
      iconColor={{ default: palette.iconDefault, selected: palette.iconSelected }}
      labelStyle={{
        default: { color: palette.textDefault, fontSize: 12, fontWeight: '600' },
        selected: { color: palette.textSelected, fontSize: 12, fontWeight: '700' },
      }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{isEn ? 'Explore' : 'Khám phá'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="home" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="activity">
        <NativeTabs.Trigger.Label>{isEn ? 'Activity' : 'Hoạt động'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="clock" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>{isEn ? 'Account' : 'Tài khoản'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="user" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function TherapistTabs({ palette, isEn }: { palette: TabPalette; isEn: boolean }) {
  return (
    <NativeTabs
      backgroundColor={palette.background}
      disableIndicator
      indicatorColor="transparent"
      rippleColor="transparent"
      iconColor={{ default: palette.iconDefault, selected: palette.iconSelected }}
      labelStyle={{
        default: { color: palette.textDefault, fontSize: 12, fontWeight: '600' },
        selected: { color: palette.textSelected, fontSize: 12, fontWeight: '700' },
      }}>
      <NativeTabs.Trigger name="therapist-schedule">
        <NativeTabs.Trigger.Label>{isEn ? 'Explore' : 'Khám phá'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="calendar" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="therapist-home">
        <NativeTabs.Trigger.Label>{isEn ? 'Jobs' : 'Nhận việc'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="clipboard" />}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Label>{isEn ? 'Account' : 'Tài khoản'}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={<NativeTabs.Trigger.VectorIcon family={Feather} name="user" />}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const palette = TAB_COLORS[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useUser();
  const { language } = useLanguage();
  const isEn = language === 'en';

  if (user?.role === 'therapist') {
    return <TherapistTabs palette={palette} isEn={isEn} />;
  }

  return <CustomerTabs palette={palette} isEn={isEn} />;
}
