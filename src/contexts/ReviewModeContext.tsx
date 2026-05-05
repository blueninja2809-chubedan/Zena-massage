import {
  APP_REVIEW_MODE,
  FORCE_HIDE_REVIEW_SURFACES,
  MANUAL_HIDE_SOCIAL_AUTH,
  MANUAL_HIDE_VIP_SUBSCRIPTION,
} from '@/constants/reviewFlags';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { storeNeedUpdate } from '@/lib/storeNeedUpdate';

type ReviewModeState = {
  hideSocialAuth: boolean;
  hideVipSubscription: boolean;
  isReviewBuild: boolean;
  currentVersion: string;
  appStoreVersion: string | null;
  appStoreUrl: string | null;
  hasAppStoreUpdate: boolean;
};

const defaultState: ReviewModeState = {
  hideSocialAuth: FORCE_HIDE_REVIEW_SURFACES || APP_REVIEW_MODE || MANUAL_HIDE_SOCIAL_AUTH,
  hideVipSubscription: FORCE_HIDE_REVIEW_SURFACES || APP_REVIEW_MODE || MANUAL_HIDE_VIP_SUBSCRIPTION,
  isReviewBuild: false,
  currentVersion: '0.0.0',
  appStoreVersion: null,
  appStoreUrl: null,
  hasAppStoreUpdate: false,
};

const ReviewModeContext = createContext<ReviewModeState>(defaultState);

function sanitizeVersion(version: string): number[] {
  return version
    .split('.')
    .map((part) => Number(part.replace(/\D/g, '') || '0'))
    .map((n) => (Number.isFinite(n) ? n : 0));
}

function compareVersions(current: string, target: string): number {
  const a = sanitizeVersion(current);
  const b = sanitizeVersion(target);
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return 1;
    if (x < y) return -1;
  }
  return 0;
}

function getCurrentVersion(): string {
  const fromConfig = Constants.expoConfig?.version?.trim();
  if (fromConfig) return fromConfig;
  const fallback = Constants.manifest2?.extra?.expoClient?.version;
  return typeof fallback === 'string' && fallback.trim() ? fallback.trim() : '0.0.0';
}

async function fetchAppStoreInfo(bundleId: string): Promise<{ version: string; url: string | null } | null> {
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const data = (await response.json()) as { results?: { version?: string; trackViewUrl?: string }[] };
    const version = data?.results?.[0]?.version;
    if (typeof version !== 'string' || !version.trim()) return null;
    const appStoreUrl = data?.results?.[0]?.trackViewUrl;
    return {
      version: version.trim(),
      url: typeof appStoreUrl === 'string' && appStoreUrl.trim() ? appStoreUrl.trim() : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function ReviewModeProvider({ children }: { children: React.ReactNode }) {
  const [currentVersion, setCurrentVersion] = useState<string>(() => getCurrentVersion());
  const [appStoreVersion, setAppStoreVersion] = useState<string | null>(null);
  const [appStoreUrl, setAppStoreUrl] = useState<string | null>(null);
  const [isReviewBuild, setIsReviewBuild] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const baseline = getCurrentVersion();

    void (async () => {
      try {
        const res = await storeNeedUpdate({ ignoreErrors: true });
        if (!cancelled && res?.latestVersion) {
          setCurrentVersion(res.currentVersion);
          setAppStoreVersion(res.latestVersion);
          setAppStoreUrl(res.storeUrl?.trim() ? res.storeUrl.trim() : null);
          setIsReviewBuild(compareVersions(res.currentVersion, res.latestVersion) > 0);
          return;
        }
      } catch {
        // Expo Go / missing native module — fall back to iTunes on iOS only.
      }

      if (Platform.OS !== 'ios') return;

      const bundleId = Constants.expoConfig?.ios?.bundleIdentifier?.trim();
      if (!bundleId) return;

      const storeInfo = await fetchAppStoreInfo(bundleId);
      if (cancelled || !storeInfo) return;
      setAppStoreVersion(storeInfo.version);
      setAppStoreUrl(storeInfo.url);
      setIsReviewBuild(compareVersions(baseline, storeInfo.version) > 0);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<ReviewModeState>(() => {
    const hasAppStoreUpdate =
      Boolean(appStoreVersion) &&
      compareVersions(currentVersion, appStoreVersion ?? '0.0.0') < 0;
    return {
      currentVersion,
      appStoreVersion,
      appStoreUrl,
      hasAppStoreUpdate,
      isReviewBuild,
      hideSocialAuth:
        FORCE_HIDE_REVIEW_SURFACES || APP_REVIEW_MODE || MANUAL_HIDE_SOCIAL_AUTH,
      hideVipSubscription:
        FORCE_HIDE_REVIEW_SURFACES || APP_REVIEW_MODE || MANUAL_HIDE_VIP_SUBSCRIPTION,
    };
  }, [appStoreVersion, appStoreUrl, currentVersion, isReviewBuild]);

  return <ReviewModeContext.Provider value={value}>{children}</ReviewModeContext.Provider>;
}

export function useReviewMode() {
  return useContext(ReviewModeContext);
}
