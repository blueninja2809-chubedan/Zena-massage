import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

import { getProvinceCentroid } from '@/lib/vietnamProvinceCentroids';
import type { Therapist } from '@/lib/types';

export type Coordinates = {
  latitude: number;
  longitude: number;
};

const LAST_CUSTOMER_LOCATION_KEY = 'app_last_customer_location_v1';

/** Phân loại trạng thái permission để UI biết cần show prompt hay mở Settings. */
export type LocationPermissionStatus = 'granted' | 'undetermined' | 'denied';

export async function getLocationPermissionStatus(): Promise<LocationPermissionStatus> {
  try {
    const p = await Location.getForegroundPermissionsAsync();
    if (p.status === 'granted') return 'granted';
    if (p.status === 'undetermined') return 'undetermined';
    return 'denied';
  } catch {
    return 'undetermined';
  }
}

/**
 * Yêu cầu quyền foreground. Trả về status mới sau khi prompt (hoặc trạng thái
 * hiện tại nếu đã denied vĩnh viễn — iOS chỉ cho hỏi 1 lần). Khi `denied`
 * UI nên hướng dẫn người dùng vào Settings.
 */
export async function requestForegroundLocationPermission(): Promise<LocationPermissionStatus> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (current.status === 'granted') return 'granted';
    // `canAskAgain === false` (iOS denied / Android "don't ask again") → không thể prompt nữa.
    if (current.status === 'denied' && current.canAskAgain === false) {
      return 'denied';
    }
    const next = await Location.requestForegroundPermissionsAsync();
    if (next.status === 'granted') return 'granted';
    if (next.status === 'undetermined') return 'undetermined';
    return 'denied';
  } catch {
    return 'undetermined';
  }
}

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= -90 && value <= 90;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= -180 && value <= 180;
}

function isValidCoordinates(coords: Coordinates | null | undefined): coords is Coordinates {
  if (!coords) {
    return false;
  }
  return isValidLatitude(coords.latitude) && isValidLongitude(coords.longitude);
}

function roundToTenth(value: number): number {
  return Math.round(value * 10) / 10;
}

function toCoordinates(location: Location.LocationObject): Coordinates | null {
  const latitude = Number(location.coords.latitude);
  const longitude = Number(location.coords.longitude);
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
    return null;
  }
  return { latitude, longitude };
}

async function getCurrentCoordinates(): Promise<Coordinates | null> {
  let seeded: Coordinates | null = null;
  try {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 120_000,
      requiredAccuracy: 2000,
    });
    if (lastKnown) {
      seeded = toCoordinates(lastKnown);
    }
  } catch {
    // ignore
  }

  try {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
      maximumAge: 20_000,
    });
    const coords = toCoordinates(current);
    if (coords) {
      return coords;
    }
  } catch {
    // fall through
  }

  try {
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Highest,
      maximumAge: 60_000,
    });
    const coords = toCoordinates(current);
    if (coords) {
      return coords;
    }
  } catch {
    // fall through
  }

  if (seeded) {
    return seeded;
  }

  try {
    const lastKnown = await Location.getLastKnownPositionAsync({
      maxAge: 10 * 60 * 1000,
      requiredAccuracy: 500,
    });
    if (!lastKnown) {
      return null;
    }
    return toCoordinates(lastKnown);
  } catch {
    return null;
  }
}

export async function getStoredCustomerLocation(): Promise<Coordinates | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_CUSTOMER_LOCATION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<Coordinates>;
    const latitude = Number(parsed.latitude);
    const longitude = Number(parsed.longitude);
    if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) {
      return null;
    }
    return { latitude, longitude };
  } catch {
    return null;
  }
}

export async function storeCustomerLocation(coords: Coordinates): Promise<void> {
  if (!isValidCoordinates(coords)) {
    return;
  }
  try {
    await AsyncStorage.setItem(LAST_CUSTOMER_LOCATION_KEY, JSON.stringify(coords));
  } catch {
    // Best effort cache only.
  }
}

/**
 * Luôn re-prompt nếu permission còn `undetermined`. Khi denied vĩnh viễn,
 * caller sẽ chịu trách nhiệm hướng người dùng vào Settings (xem
 * `requestForegroundLocationPermission`).
 */
export async function requestInitialPreciseLocationAccess(): Promise<Coordinates | null> {
  const status = await requestForegroundLocationPermission();
  if (status !== 'granted') {
    return null;
  }
  const coords = await getCurrentCoordinates();
  if (coords) {
    await storeCustomerLocation(coords);
  }
  return coords;
}

/**
 * Foreground subscription to device GPS. Persists each fix via {@link storeCustomerLocation}.
 * Caller must ensure foreground permission is granted (e.g. after {@link refreshCustomerLocation}).
 */
export async function watchCustomerLocation(
  onCoords: (coords: Coordinates) => void,
  options: { distanceIntervalMeters?: number; timeIntervalMs?: number } = {},
): Promise<(() => void) | null> {
  const permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== 'granted') {
    return null;
  }

  const distanceInterval = options.distanceIntervalMeters ?? 250;
  const timeInterval = options.timeIntervalMs ?? 45_000;

  try {
    const sub = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        distanceInterval,
        timeInterval,
      },
      (loc) => {
        const c = toCoordinates(loc);
        if (c) {
          void storeCustomerLocation(c);
          onCoords(c);
        }
      },
    );
    return () => {
      sub.remove();
    };
  } catch {
    return null;
  }
}

export async function refreshCustomerLocation(
  options: { askPermissionIfNeeded?: boolean } = {},
): Promise<Coordinates | null> {
  const askPermissionIfNeeded = options.askPermissionIfNeeded ?? false;
  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status === 'undetermined' && askPermissionIfNeeded) {
    permission = await Location.requestForegroundPermissionsAsync();
  }

  if (permission.status !== 'granted') {
    return getStoredCustomerLocation();
  }

  const coords = await getCurrentCoordinates();
  if (!coords) {
    return getStoredCustomerLocation();
  }
  await storeCustomerLocation(coords);
  return coords;
}

export function haversineKm(a: Coordinates, b: Coordinates): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);
  const x = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Bbox lục địa VN (có lề) — dùng phát hiện GPS simulator / nước ngoài. */
const VN_BOUNDS_LAT_MIN = 8.15;
const VN_BOUNDS_LAT_MAX = 23.95;
const VN_BOUNDS_LNG_MIN = 101.8;
const VN_BOUNDS_LNG_MAX = 110.2;

function isInVietnamMainlandBBox(coords: Coordinates): boolean {
  return (
    coords.latitude >= VN_BOUNDS_LAT_MIN &&
    coords.latitude <= VN_BOUNDS_LAT_MAX &&
    coords.longitude >= VN_BOUNDS_LNG_MIN &&
    coords.longitude <= VN_BOUNDS_LNG_MAX
  );
}

/**
 * Chọn điểm neo của khách để tính km / sort "Gần tôi".
 *
 * - Ưu tiên GPS thật khi **gần** tỉnh đang xem (hoặc đang trong lãnh thổ VN và không chọn tỉnh).
 * - Nếu GPS cách **tâm tỉnh đã chọn** quá xa (vd. simulator Mỹ + UI "Hà Nội") → dùng tâm tỉnh,
 *   để km phản ánh khoảng cách trong vùng đang lọc và các KTV có live GPS **khác nhau được**.
 * - Không có tọa độ thiết bị → chỉ dùng tâm tỉnh nếu đã chọn tỉnh.
 */
export function resolveCustomerLocationForDistance(
  deviceCoords: Coordinates | null,
  selectedCity: string | null | undefined,
): Coordinates | null {
  const city = typeof selectedCity === 'string' ? selectedCity.trim() : '';
  const cityCentroid = city ? getProvinceCentroid(city) : null;

  if (!isValidCoordinates(deviceCoords)) {
    return cityCentroid;
  }

  if (cityCentroid) {
    const kmFromCityCenter = haversineKm(deviceCoords, cityCentroid);
    if (kmFromCityCenter > 450) {
      return cityCentroid;
    }
    return deviceCoords;
  }

  if (!isInVietnamMainlandBBox(deviceCoords)) {
    return null;
  }
  return deviceCoords;
}

/**
 * Tính khoảng cách (km) từ khách → KTV.
 *
 * Ưu tiên 1: `currentLatitude/currentLongitude` thật của KTV (live GPS).
 * Ưu tiên 2: tâm hành chính của `workingCity` (từ {@link getProvinceCentroid}).
 *   → vẫn cho KTV chưa share GPS có giá trị sort/hiển thị (sai số vài km).
 * Nếu cả hai đều thiếu → giữ nguyên `distanceFromCenter` cũ (mock) và
 * gắn `distanceFromCenter = Number.POSITIVE_INFINITY` để sort xuống cuối.
 */
export function applyCustomerDistanceToTherapists(
  therapists: Therapist[],
  customerLocation: Coordinates | null,
): Therapist[] {
  if (!isValidCoordinates(customerLocation)) {
    return therapists;
  }

  return therapists.map((item) => {
    const liveLat = Number(item.currentLatitude);
    const liveLng = Number(item.currentLongitude);
    if (isValidLatitude(liveLat) && isValidLongitude(liveLng)) {
      const km = roundToTenth(haversineKm(customerLocation, { latitude: liveLat, longitude: liveLng }));
      return {
        ...item,
        distanceFromCenter: Math.max(0, km),
      };
    }

    const cityCentroid = getProvinceCentroid(item.workingCity ?? null);
    if (cityCentroid) {
      const km = roundToTenth(haversineKm(customerLocation, cityCentroid));
      return {
        ...item,
        distanceFromCenter: Math.max(0, km),
      };
    }

    // Không có cả live GPS lẫn workingCity hợp lệ → đẩy xuống cuối khi sort.
    return {
      ...item,
      distanceFromCenter: Number.POSITIVE_INFINITY,
    };
  });
}
