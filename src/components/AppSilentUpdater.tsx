import React from 'react';
import { AppState, AppStateStatus } from 'react-native';

/** Throttle foreground checks (EAS rate limits); initial launch always checks. */
const MIN_CHECK_INTERVAL_MS = 45_000;
let lastCheckAt = 0;

/**
 * EAS Update: after fetchUpdateAsync(), the new JS is on disk but does not run until
 * reloadAsync() or a full cold start. This path reloads immediately so users get JS fixes
 * without deleting the app (same native binary / runtime version).
 */
async function runSilentUpdate(force: boolean): Promise<void> {
  if (__DEV__) return;

  const now = Date.now();
  if (!force && now - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
  lastCheckAt = now;

  try {
    const Updates = await import('expo-updates');
    if (!Updates.isEnabled) return;

    const result = await Updates.checkForUpdateAsync();
    if (result?.isAvailable) {
      await Updates.fetchUpdateAsync();
      await Updates.reloadAsync();
    }
  } catch {
    // Expo Go / dev client / network / updates disabled — ignore.
  }
}

export default function AppSilentUpdater() {
  React.useEffect(() => {
    lastCheckAt = 0;
    void runSilentUpdate(true);

    const handleStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        void runSilentUpdate(false);
      }
    };

    const subscription = AppState.addEventListener('change', handleStateChange);
    return () => subscription.remove();
  }, []);

  return null;
}
