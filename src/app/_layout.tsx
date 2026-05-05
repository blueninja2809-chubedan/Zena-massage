import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import GlobalAlertHost from '@/components/GlobalAlertHost';
import AppLocationBootstrap from '@/components/AppLocationBootstrap';
import AppSilentUpdater from '@/components/AppSilentUpdater';
import AppUpdatePrompt from '@/components/AppUpdatePrompt';
import { AppColors } from '@/constants/appColors';
import { ActiveBookingProvider } from '@/contexts/ActiveBookingContext';
import { BookingsProvider } from '@/contexts/BookingsContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { ReviewModeProvider } from '@/contexts/ReviewModeContext';
import { UserProvider } from '@/contexts/UserContext';
import { ensureNativeBootSplashHeld } from '@/lib/nativeBootSplash';

ensureNativeBootSplashHeld();

type BoundaryState = { error: Error | null };

/** Catches render errors so a single bad screen does not hard-crash the process during review. */
class AppErrorBoundary extends React.Component<{ children: React.ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.warn('[AppErrorBoundary]', error.message, info.componentStack);
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <View style={boundaryStyles.wrap}>
          <Text style={boundaryStyles.title}>Đã xảy ra lỗi</Text>
          <Text style={boundaryStyles.msg} numberOfLines={4}>
            {this.state.error.message}
          </Text>
          <TouchableOpacity
            style={boundaryStyles.btn}
            onPress={() => this.setState({ error: null })}
            activeOpacity={0.85}
          >
            <Text style={boundaryStyles.btnText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const boundaryStyles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'center',
    padding: 28,
    backgroundColor: AppColors.bg,
  },
  title: { fontSize: 20, fontWeight: '700', color: AppColors.text, marginBottom: 12 },
  msg: { fontSize: 14, color: AppColors.textMuted, marginBottom: 24 },
  btn: {
    alignSelf: 'flex-start',
    backgroundColor: AppColors.primaryDark,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 14,
  },
  btnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});

export default function RootLayout() {
  const colorScheme = useColorScheme();

  React.useEffect(() => {
    // In dev-client, Expo's KeepAwake toggle can occasionally reject after activity recreation
    // (e.g. fast refresh / background-resume). Ignore only that specific unhandled rejection.
    const proc: any = (globalThis as any)?.process;
    if (!proc?.on || !proc?.off) return;

    const handler = (reason: any) => {
      const msg = typeof reason === 'string' ? reason : reason?.message ? String(reason.message) : String(reason);
      if (
        msg.includes('ExpoKeepAwake.activate') &&
        msg.toLowerCase().includes('current activity is no longer available')
      ) {
        return;
      }
    };

    proc.on('unhandledRejection', handler);
    return () => proc.off('unhandledRejection', handler);
  }, []);

  return (
    <SafeAreaProvider>
      <AppErrorBoundary>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <GlobalAlertHost />
          <AppSilentUpdater />
          <LanguageProvider>
            <ReviewModeProvider>
              <AppUpdatePrompt />
              <UserProvider>
                <AppLocationBootstrap />
                <BookingsProvider>
                  <NotificationProvider>
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
                  </NotificationProvider>
                </BookingsProvider>
              </UserProvider>
            </ReviewModeProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AppErrorBoundary>
    </SafeAreaProvider>
  );
}
