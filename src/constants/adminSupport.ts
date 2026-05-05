/**
 * Admin mặc định cho chat KTV ↔ Support (trùng UUID với profiles + admin web nếu có).
 * Biến EXPO_PUBLIC_ADMIN_USER_ID / EXPO_PUBLIC_ADMIN_DISPLAY_NAME ghi đè khi build.
 */
export const DEFAULT_ADMIN_USER_ID = '04e2f077-bbd9-4364-b34c-e4c88ba0d346';
export const DEFAULT_ADMIN_DISPLAY_NAME = 'Support Zena';

export function getExpoAdminUserId(): string {
  return (process.env.EXPO_PUBLIC_ADMIN_USER_ID ?? '').trim() || DEFAULT_ADMIN_USER_ID;
}

export function getExpoAdminDisplayName(): string {
  return (process.env.EXPO_PUBLIC_ADMIN_DISPLAY_NAME ?? '').trim() || DEFAULT_ADMIN_DISPLAY_NAME;
}
