import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';

import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';
import { AppColors } from '@/constants/appColors';

const TAB_COLORS = {
  light: {
    background: AppColors.bg,
    iconDefault: '#6B5F52',
    iconSelected: AppColors.primaryDark,
  },
  dark: {
    background: '#141210',
    iconDefault: '#9A8F85',
    iconSelected: AppColors.primary,
  },
} as const;

type TabPalette = (typeof TAB_COLORS)[keyof typeof TAB_COLORS];

function CustomerTabs({ palette, isEn }: { palette: TabPalette; isEn: boolean }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: palette.background },
        tabBarActiveTintColor: palette.iconSelected,
        tabBarInactiveTintColor: palette.iconDefault,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: isEn ? 'Explore' : 'Khám phá',
          tabBarIcon: ({ color, size }) => <Feather name="home" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: isEn ? 'Activity' : 'Hoạt động',
          tabBarIcon: ({ color, size }) => <Feather name="clock" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: isEn ? 'Account' : 'Tài khoản',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="therapist-home" options={{ href: null }} />
      <Tabs.Screen name="therapist-schedule" options={{ href: null }} />
    </Tabs>
  );
}

function TherapistTabs({ palette, isEn }: { palette: TabPalette; isEn: boolean }) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: palette.background },
        tabBarActiveTintColor: palette.iconSelected,
        tabBarInactiveTintColor: palette.iconDefault,
      }}>
      <Tabs.Screen
        name="therapist-schedule"
        options={{
          title: isEn ? 'Explore' : 'Khám phá',
          tabBarIcon: ({ color, size }) => <Feather name="calendar" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="therapist-home"
        options={{
          title: isEn ? 'Jobs' : 'Nhận việc',
          tabBarIcon: ({ color, size }) => <Feather name="clipboard" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: isEn ? 'Account' : 'Tài khoản',
          tabBarIcon: ({ color, size }) => <Feather name="user" size={size} color={color} />,
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
    </Tabs>
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
