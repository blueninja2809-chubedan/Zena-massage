import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

/**
 * React Native's Modal renders in a separate window and does not inherit the root
 * SafeAreaProvider. Full-screen modal content must wrap its own provider so
 * SafeAreaView / useSafeAreaInsets measure correctly (otherwise top inset is often 0).
 */
export function ModalSafeAreaProvider({ children }: { children: React.ReactNode }) {
  return <SafeAreaProvider>{children}</SafeAreaProvider>;
}
