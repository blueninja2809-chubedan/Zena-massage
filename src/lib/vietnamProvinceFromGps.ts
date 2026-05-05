import * as Location from 'expo-location';

import { VIETNAM_PROVINCES } from '@/constants/bookingFilters';

import type { Coordinates } from '@/lib/location';

function normalizeKey(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** English / portal spellings → canonical label in `VIETNAM_PROVINCES`. */
const ALIAS_TO_CANON: readonly [string, string][] = [
  ['ho chi minh city', 'TP.HCM'],
  ['ho chi minh', 'TP.HCM'],
  ['thanh pho ho chi minh', 'TP.HCM'],
  ['tp ho chi minh', 'TP.HCM'],
  ['tp hcm', 'TP.HCM'],
  ['hcmc', 'TP.HCM'],
  ['saigon', 'TP.HCM'],
  ['sai gon', 'TP.HCM'],
  ['hanoi', 'Hà Nội'],
  ['ha noi', 'Hà Nội'],
  ['da nang', 'Đà Nẵng'],
  ['danang', 'Đà Nẵng'],
  ['hai phong', 'Hải Phòng'],
  ['haiphong', 'Hải Phòng'],
  ['can tho', 'Cần Thơ'],
  ['cantho', 'Cần Thơ'],
  ['thua thien hue', 'Thừa Thiên Huế'],
  ['hue city', 'Thừa Thiên Huế'],
  ['hue', 'Thừa Thiên Huế'],
  ['ba ria vung tau', 'Bà Rịa - Vũng Tàu'],
  ['ba ria', 'Bà Rịa - Vũng Tàu'],
  ['vung tau', 'Bà Rịa - Vũng Tàu'],
  ['dak lak', 'Đắk Lắk'],
  ['dac lac', 'Đắk Lắk'],
  ['dak nong', 'Đắk Nông'],
  ['dac nong', 'Đắk Nông'],
];

const PROVINCES_BY_NORM_LEN = [...VIETNAM_PROVINCES].sort(
  (a, b) => normalizeKey(b).length - normalizeKey(a).length,
);

export function matchVietnamProvinceFromGeocode(
  addr: Location.LocationGeocodedAddress,
): string | null {
  const parts = [
    addr.city,
    addr.district,
    addr.subregion,
    addr.region,
    addr.name,
    addr.formattedAddress,
  ].filter((x): x is string => typeof x === 'string' && x.trim().length > 0);

  const blob = normalizeKey(parts.join(' | '));
  if (!blob) {
    return null;
  }

  for (const [alias, canon] of ALIAS_TO_CANON) {
    if (blob.includes(normalizeKey(alias))) {
      return canon;
    }
  }

  for (const p of PROVINCES_BY_NORM_LEN) {
    const np = normalizeKey(p);
    if (np.length < 4) {
      continue;
    }
    if (blob.includes(np)) {
      return p;
    }
  }

  for (const part of parts) {
    const n = normalizeKey(part);
    if (n.length < 3) {
      continue;
    }
    for (const p of VIETNAM_PROVINCES) {
      if (normalizeKey(p) === n) {
        return p;
      }
    }
  }

  return null;
}

export async function inferVietnamProvinceFromCoordinates(
  coords: Coordinates,
): Promise<string | null> {
  try {
    const results = await Location.reverseGeocodeAsync({
      latitude: coords.latitude,
      longitude: coords.longitude,
    });
    const first = results?.[0];
    if (!first) {
      return null;
    }
    return matchVietnamProvinceFromGeocode(first);
  } catch {
    return null;
  }
}
