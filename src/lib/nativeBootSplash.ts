import * as SplashScreen from 'expo-splash-screen';
import { Platform } from 'react-native';

/** Keeps the native launch layer up until JS boot UI is ready; then dismisses once. */
export function ensureNativeBootSplashHeld(): void {
  if (Platform.OS === 'web') return;
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

/**
 * After React has committed boot UI (Zena loading / onboarding), hide the native splash
 * on the next frame so users only perceive your in-app loading screen.
 * `hideAsync` is safe to call more than once (e.g. React Strict Mode).
 */
export function scheduleHideNativeBootSplash(): void {
  if (Platform.OS === 'web') return;
  requestAnimationFrame(() => {
    void SplashScreen.hideAsync().catch(() => {});
  });
}
