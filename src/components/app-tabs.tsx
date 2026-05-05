import Feather from '@expo/vector-icons/Feather';
import { Tabs } from 'expo-router';
import React from 'react';
import { StyleSheet, useWindowDimensions, type ViewStyle } from 'react-native';

import { AppColors } from '@/constants/appColors';
import { debugLog } from '@/lib/debugLog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useUser } from '@/contexts/UserContext';

/** Full-bleed tab scenes — avoids letterboxing on some devices / aspect ratios. */
const TAB_SCENE_STYLE: ViewStyle = {
  flex: 1,
  width: '100%',
  maxWidth: '100%',
  alignSelf: 'stretch',
};

/** Always light “Zena” tab bar — system dark mode was making the bar near-black and clashing with the cream UI */
const TAB_BAR = {
  background: AppColors.bg,
  iconDefault: '#6B5F52',
  iconSelected: AppColors.primaryDark,
  textDefault: '#6B5F52',
  textSelected: AppColors.primaryDark,
} as const;

type TabPalette = typeof TAB_BAR;

function CustomerTabs({
  palette,
  isEn,
  tabLabelStyle,
  tabItemStyle,
  tabBarStyle,
}: {
  palette: TabPalette;
  isEn: boolean;
  tabLabelStyle: { fontSize: number; fontWeight: '700'; marginTop?: number; marginBottom?: number };
  tabItemStyle: {
    borderRadius: number;
    marginHorizontal: number;
    paddingVertical?: number;
  };
  tabBarStyle: {
    backgroundColor: string;
    borderTopWidth: number;
    elevation: number;
    shadowOpacity: number;
  };
}) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: TAB_SCENE_STYLE,
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
        name="support"
        options={{
          title: isEn ? 'Support' : 'Hỗ trợ',
          tabBarIcon: ({ color, size }) => <Feather name="phone-call" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: isEn ? 'Account' : 'Tài khoản',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
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
  tabLabelStyle: { fontSize: number; fontWeight: '700'; marginTop?: number; marginBottom?: number };
  tabItemStyle: {
    borderRadius: number;
    marginHorizontal: number;
    paddingVertical?: number;
  };
  tabBarStyle: {
    backgroundColor: string;
    borderTopWidth: number;
    elevation: number;
    shadowOpacity: number;
  };
}) {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: TAB_SCENE_STYLE,
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
        name="support"
        options={{
          title: isEn ? 'Support' : 'Hỗ trợ',
          tabBarIcon: ({ color, size }) => <Feather name="phone-call" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: isEn ? 'Account' : 'Tài khoản',
          tabBarIcon: ({ color, size }) => <Feather name="user" color={color} size={size} />,
        }}
      />
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen name="activity" options={{ href: null }} />
    </Tabs>
  );
}

export default function AppTabs() {
  const { width, height } = useWindowDimensions();
  const isTablet = Math.min(width, height) >= 768;
  const palette: TabPalette = TAB_BAR;
  const { user } = useUser();
  const { language } = useLanguage();
  const isEn = language === 'en';

  /**
   * Do not set height / paddingBottom on tabBarStyle: @react-navigation/bottom-tabs already applies
   * paddingBottom: insets.bottom for the home indicator. Our old fixed height + paddingBottom + marginBottom
   * overwrote that on real devices (simulator often has bottom inset 0 so it looked fine).
   */
  const tabLabelStyle = {
    fontSize: isTablet ? 13 : 12,
    fontWeight: '700' as const,
    marginTop: 2,
    marginBottom: 0,
  };
  const tabItemStyle = {
    borderRadius: 0,
    marginHorizontal: isTablet ? 6 : 2,
    paddingVertical: isTablet ? 4 : 3,
  };
  const tabBarStyle = {
    backgroundColor: palette.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(47,36,28,0.12)',
    elevation: 0,
    shadowOpacity: 0,
  };

  React.useEffect(() => {
    debugLog('app-tabs', {
      w: width,
      h: height,
      isTablet,
      role: user?.role ?? 'customer',
      tabLabelFont: tabLabelStyle.fontSize,
    });
  }, [width, height, isTablet, user?.role, tabLabelStyle.fontSize]);

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
