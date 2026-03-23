import Feather from '@expo/vector-icons/Feather';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';
import { useColorScheme } from 'react-native';

import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';

const TAB_COLORS = {
  light: {
    background: '#F5F9FF',
    indicator: '#BBDEFB',
    iconDefault: '#5C85B0',
    iconSelected: '#2196F3',
    textDefault: '#5C85B0',
    textSelected: '#2196F3',
  },
  dark: {
    background: '#0A1929',
    indicator: '#1A3A5C',
    iconDefault: '#7BAED4',
    iconSelected: '#E3F2FD',
    textDefault: '#7BAED4',
    textSelected: '#E3F2FD',
  },
} as const;

type TabPalette = (typeof TAB_COLORS)[keyof typeof TAB_COLORS];

function CustomerTabs({ palette, isEn }: { palette: TabPalette; isEn: boolean }) {
  return (
    <NativeTabs
      backgroundColor={palette.background}
      indicatorColor={palette.indicator}
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
      indicatorColor={palette.indicator}
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
