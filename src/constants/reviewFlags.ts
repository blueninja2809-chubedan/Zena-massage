const TRUTHY_VALUES = new Set(['1', 'true', 'yes', 'on']);

function envFlag(name: string): boolean {
  const value = (process.env[name] ?? '').trim().toLowerCase();
  return TRUTHY_VALUES.has(value);
}

// Build-time override for App Store review builds.
export const APP_REVIEW_MODE = envFlag('EXPO_PUBLIC_APP_REVIEW_MODE');
/** Client-only demo therapists + reviews (no Supabase rows). Enable for review builds or local testing. */
export const INCLUDE_VIRTUAL_THERAPISTS =
  APP_REVIEW_MODE || envFlag('EXPO_PUBLIC_VIRTUAL_THERAPISTS');
export const MANUAL_HIDE_SOCIAL_AUTH = envFlag('EXPO_PUBLIC_HIDE_SOCIAL_AUTH');
export const MANUAL_HIDE_VIP_SUBSCRIPTION = envFlag('EXPO_PUBLIC_HIDE_VIP_SUBSCRIPTION');

// Temporary emergency lock for App Store resubmission.
// Keep `false` for normal release builds.
export const FORCE_HIDE_REVIEW_SURFACES = false;
