import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import React from 'react';
import { useColorScheme, useWindowDimensions } from 'react-native';

import { AppColors } from '@/constants/appColors';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';

const TAB_COLORS = {
  light: {
    background: AppColors.bg,
    iconDefault: '#6B5F52',
    iconSelected: AppColors.primaryDark,
    textDefault: '#6B5F52',
    textSelected: AppColors.primaryDark,
  },
  dark: {
    background: '#141210',
    iconDefault: '#9A8F85',
    iconSelected: AppColors.primary,
    textDefault: '#9A8F85',
    textSelected: AppColors.primary,
  },
} as const;

type TabPalette = (typeof TAB_COLORS)[keyof typeof TAB_COLORS];

function CustomerTabs({
  palette,
  isEn,
  tabLabelStyle,
  tabItemStyle,
  tabBarStyle,
}: {
  palette: TabPalette;
  isEn: boolean;
  tabLabelStyle: { fontSize: number; fontWeight: '700' };
  tabItemStyle: {
    borderRadius: number;
    marginHorizontal: number;
  };
  tabBarStyle: {
    backgroundColor: string;
    borderTopWidth: number;
    elevation: number;
    shadowOpacity: number;
    height?: number;
    paddingBottom?: number;
    paddingTop?: number;
  };
}) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.textSelected,
        tabBarInactiveTintColor: palette.textDefault,
        tabBarLabelStyle: tabLabelStyle,
        tabBarStyle,
        // Keep transitions simple and avoid highlighted bubble-like feedback.
        tabBarItemStyle: tabItemStyle,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: isEn ? 'Explore' : 'Khám phá',
          tabBarIcon: ({ color, size }) => <Feather name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="activity"
        options={{
          title: isEn ? 'Activity' : 'Hoạt động',
          tabBarIcon: ({ color, size }) => <Feather name="clock" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: isEn ? 'Account' : 'Tài khoản',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: isEn ? 'Support' : 'Hỗ trợ',
          tabBarIcon: ({ color, size }) => <Feather name="phone-call" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="therapist-home" options={{ href: null }} />
      <Tabs.Screen name="therapist-schedule" options={{ href: null }} />
    </Tabs>
  );
}

function TherapistTabs({
  palette,
  isEn,
  tabLabelStyle,
  tabItemStyle,
  tabBarStyle,
}: {
  palette: TabPalette;
  isEn: boolean;
  tabLabelStyle: { fontSize: number; fontWeight: '700' };
  tabItemStyle: {
    borderRadius: number;
    marginHorizontal: number;
  };
  tabBarStyle: {
    backgroundColor: string;
    borderTopWidth: number;
    elevation: number;
    shadowOpacity: number;
    height?: number;
    paddingBottom?: number;
    paddingTop?: number;
  };
}) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.textSelected,
        tabBarInactiveTintColor: palette.textDefault,
        tabBarLabelStyle: tabLabelStyle,
        tabBarStyle,
        tabBarItemStyle: tabItemStyle,
      }}>
      <Tabs.Screen
        name="therapist-schedule"
        options={{
          title: isEn ? 'Explore' : 'Khám phá',
          tabBarIcon: ({ color, size }) => <Feather name="calendar" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="therapist-home"
        options={{
          title: isEn ? 'Jobs' : 'Nhận việc',
          tabBarIcon: ({ color, size }) => <Feather name="clipboard" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: isEn ? 'Account' : 'Tài khoản',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="support"
        options={{
          title: isEn ? 'Support' : 'Hỗ trợ',
          tabBarIcon: ({ color, size }) => <Feather name="phone-call" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppTabs() {
  const scheme = useColorScheme();
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;
  const palette = TAB_COLORS[scheme === 'dark' ? 'dark' : 'light'];
  const { user } = useUser();
  const { language } = useLanguage();
  const isEn = language === 'en';
  const tabLabelStyle = {
    fontSize: isTablet ? 14 : 13,
    fontWeight: '700' as const,
    marginLeft: isTablet ? 3 : 2,
  };
  const tabItemStyle = {
    borderRadius: 0,
    marginHorizontal: isTablet ? 6 : 4,
  };
  const tabBarStyle = {
    backgroundColor: palette.background,
    borderTopWidth: 0.5,
    borderTopColor: 'rgba(0,0,0,0.08)',
    elevation: 0,
    shadowOpacity: 0,
    height: isTablet ? 68 : 64,
    paddingBottom: isTablet ? 5 : 6,
    paddingTop: isTablet ? 6 : 7,
    /** Nâng cả thanh tab lên khỏi mép dưới màn hình một chút */
    marginBottom: isTablet ? 10 : 12,
  };

  if (user?.role === 'therapist') {
    return (
      <TherapistTabs
        palette={palette}
        isEn={isEn}
        tabLabelStyle={tabLabelStyle}
        tabItemStyle={tabItemStyle}
        tabBarStyle={tabBarStyle}
      />
    );
  }

  return (
    <CustomerTabs
      palette={palette}
      isEn={isEn}
      tabLabelStyle={tabLabelStyle}
      tabItemStyle={tabItemStyle}
      tabBarStyle={tabBarStyle}
    />
  );
}
