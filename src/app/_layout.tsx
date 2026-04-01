import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { AppColors } from '@/constants/appColors';
import { ActiveBookingProvider } from '@/contexts/ActiveBookingContext';
import { BookingsProvider } from '@/contexts/BookingsContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { UserProvider } from '@/contexts/UserContext';

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <LanguageProvider>
          <UserProvider>
            <NotificationProvider>
              <BookingsProvider>
                <ActiveBookingProvider>
                  <Stack
                    screenOptions={{
                      headerShown: false,
                      animation: 'slide_from_right',
                      contentStyle: { backgroundColor: AppColors.bg },
                      gestureEnabled: true,
                      fullScreenGestureEnabled: true,
                    }}
                  />
                </ActiveBookingProvider>
              </BookingsProvider>
            </NotificationProvider>
          </UserProvider>
        </LanguageProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
