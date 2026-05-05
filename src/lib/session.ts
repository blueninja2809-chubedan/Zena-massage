import type { UserData } from '@/contexts/UserContext';

export function isUserSignedIn(user: UserData | null | undefined): boolean {
  const id = user?.authUid;
  return typeof id === 'string' && id.trim().length > 0;
}

export function canUseAppFeatures(user: UserData | null | undefined): boolean {
  return isUserSignedIn(user);
}

/** When true, booking can use a fake user id (E2E / local only). Set EXPO_PUBLIC_E2E_ALLOW_UNSIGNED=1 in .env */
export function allowUnsignedForE2ETest(): boolean {
  return (
    typeof __DEV__ !== 'undefined' &&
    __DEV__ &&
    process.env.EXPO_PUBLIC_E2E_ALLOW_UNSIGNED === '1'
  );
}
