/**
 * App Store Guideline 3.1.2 — same URLs as App Store Connect (Privacy Policy URL, Terms of Use).
 * Set in `.env` before shipping: EXPO_PUBLIC_TERMS_URL, EXPO_PUBLIC_PRIVACY_POLICY_URL
 */
const DEFAULT_TERMS_OF_USE_URL = 'https://www.apple.com/legal/internet-services/itunes/dev/stdeula/';
const DEFAULT_PRIVACY_POLICY_URL = 'https://zenavietnam.com/dieu-khoan-su-dung/';

export const TERMS_OF_USE_URL =
  (process.env.EXPO_PUBLIC_TERMS_URL ?? '').trim() || DEFAULT_TERMS_OF_USE_URL;
export const PRIVACY_POLICY_URL =
  (process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL ?? '').trim() || DEFAULT_PRIVACY_POLICY_URL;
