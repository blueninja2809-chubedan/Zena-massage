/**
 * Thay react-native-version-check (Gradle cũ / AGP 9): lấy phiên bản store bằng fetch,
 * phiên bản hiện tại từ expo-constants / expo-application — không cần native module Android.
 */
import Constants from 'expo-constants';
import * as Application from 'expo-application';
import { Platform } from 'react-native';
import semver from 'semver';

function getCurrentVersionString(): string {
  const v = Constants.expoConfig?.version?.trim();
  if (v) return v;
  const nv = Application.nativeApplicationVersion;
  if (typeof nv === 'string' && nv.trim()) return nv.trim();
  return '0.0.0';
}

function getIosBundleId(): string {
  return Constants.expoConfig?.ios?.bundleIdentifier?.trim() ?? '';
}

function getAndroidPackage(): string {
  return Constants.expoConfig?.android?.package?.trim() ?? 'com.zena.massagenow';
}

async function fetchIOSStoreVersion(): Promise<{ version: string; storeUrl: string } | null> {
  const bundleId = getIosBundleId();
  if (!bundleId) return null;
  const url = `https://itunes.apple.com/lookup?bundleId=${encodeURIComponent(bundleId)}`;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: { version?: string; trackId?: number }[];
    };
    const row = data?.results?.[0];
    const version = row?.version;
    const appId = row?.trackId;
    if (typeof version !== 'string' || !version.trim()) return null;
    if (typeof appId !== 'number') {
      return null;
    }
    const storeUrl = `itms-apps://apps.apple.com/app/id${appId}`;
    return { version: version.trim(), storeUrl };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function fetchPlayStoreVersion(): Promise<{ version: string; storeUrl: string } | null> {
  const packageName = getAndroidPackage();
  const storeUrl = `https://play.google.com/store/apps/details?id=${packageName}&hl=en&gl=US`;
  try {
    const res = await fetch(storeUrl, {
      headers: {
        Accept: 'text/html,application/xhtml+xml',
        'User-Agent':
          'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
      },
    });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/Current Version.+?>([\d.-]+)<\/span>/);
    if (m?.[1]) {
      return { version: m[1].trim(), storeUrl };
    }
    const m2 = text.match(/\[\[\["([\d-.]+?)"\]\]/);
    if (m2?.[1]) {
      return { version: m2[1].trim(), storeUrl };
    }
    return null;
  } catch {
    return null;
  }
}

export type StoreNeedUpdateResult = {
  isNeeded: boolean;
  storeUrl: string;
  currentVersion: string;
  latestVersion: string;
};

/**
 * Tương thích API cũ `VersionCheck.needUpdate({ ignoreErrors: true })`.
 */
export async function storeNeedUpdate(options?: {
  ignoreErrors?: boolean;
}): Promise<StoreNeedUpdateResult | undefined> {
  const ignoreErrors = options?.ignoreErrors !== false;
  try {
    const currentVersion = getCurrentVersionString();
    const remote =
      Platform.OS === 'ios' ? await fetchIOSStoreVersion() : await fetchPlayStoreVersion();

    if (!remote) {
      return undefined;
    }

    const cur = semver.coerce(currentVersion);
    const lat = semver.coerce(remote.version);
    if (!cur || !lat) {
      return {
        isNeeded: false,
        storeUrl: remote.storeUrl,
        currentVersion,
        latestVersion: remote.version,
      };
    }

    const isNeeded = semver.gt(lat, cur);
    return {
      isNeeded,
      storeUrl: remote.storeUrl,
      currentVersion,
      latestVersion: remote.version,
    };
  } catch (e) {
    if (!ignoreErrors) {
      throw e;
    }
    return undefined;
  }
}
