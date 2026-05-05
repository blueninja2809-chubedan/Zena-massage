import Feather from '@expo/vector-icons/Feather';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { VIETNAM_PROVINCES } from '@/constants/bookingFilters';
import { AppColors } from '@/constants/appColors';
import type { Coordinates } from '@/lib/location';
import { haversineKm, refreshCustomerLocation, storeCustomerLocation, watchCustomerLocation } from '@/lib/location';
import { inferVietnamProvinceFromCoordinates } from '@/lib/vietnamProvinceFromGps';

type Props = {
  /** When false, GPS hint is not re-fetched (parent may keep modal mounted). */
  active: boolean;
  selectedCity: string;
  onSelectCity: (city: string) => void;
  /** Persist + sync profile when GPS matches a catalog province; do not navigate away. */
  onGpsAutoSelect?: (city: string) => void | Promise<void>;
  isEn?: boolean;
  /** Optional: search row uses app primary (home) vs neutral (massage). */
  accentColor?: string;
};

const PIN = '#22C55E';
const TARGET = '#E53935';

const PROVINCE_LIST = VIETNAM_PROVINCES as readonly string[];

function isCatalogProvince(name: string | null | undefined): name is string {
  return !!name && PROVINCE_LIST.includes(name);
}

export function VietnamProvincePickerContent({
  active,
  selectedCity,
  onSelectCity,
  onGpsAutoSelect,
  isEn = false,
  accentColor = AppColors.primaryDark,
}: Props) {
  const [cityQuery, setCityQuery] = useState('');
  const [gpsProvince, setGpsProvince] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsDeniedOrFailed, setGpsDeniedOrFailed] = useState(false);

  const wipCancelledRef = useRef(false);
  const lastReverseRef = useRef<{ coords: Coordinates; province: string | null; at: number } | null>(null);
  const lastGpsDerivedProvinceRef = useRef<string | null>(null);

  const applyCoords = useCallback(
    async (coords: Coordinates, opts?: { forceReverse?: boolean }) => {
      if (wipCancelledRef.current) {
        return;
      }
      await storeCustomerLocation(coords);

      const now = Date.now();
      const prev = lastReverseRef.current;
      const movedKm = prev ? haversineKm(prev.coords, coords) : 999;
      const staleMs = prev ? now - prev.at : 999_999;
      const needReverse =
        opts?.forceReverse === true || !prev || movedKm >= 0.35 || staleMs >= 45_000;

      let province: string | null = null;
      if (needReverse) {
        try {
          province = await inferVietnamProvinceFromCoordinates(coords);
        } catch {
          province = null;
        }
        lastReverseRef.current = { coords, province, at: now };
      } else if (prev) {
        province = prev.province;
      }

      if (wipCancelledRef.current) {
        return;
      }

      const listed = isCatalogProvince(province);
      setGpsProvince(listed ? province : null);
      if (needReverse) {
        setGpsDeniedOrFailed(!listed);
      }
      if (listed && onGpsAutoSelect && province !== lastGpsDerivedProvinceRef.current) {
        lastGpsDerivedProvinceRef.current = province;
        await Promise.resolve(onGpsAutoSelect(province));
      }
    },
    [onGpsAutoSelect],
  );

  useEffect(() => {
    if (!active) {
      wipCancelledRef.current = true;
      return;
    }

    wipCancelledRef.current = false;
    lastGpsDerivedProvinceRef.current = null;
    lastReverseRef.current = null;
    setCityQuery('');
    setGpsProvince(null);
    setGpsDeniedOrFailed(false);

    let removeWatch: (() => void) | null = null;

    void (async () => {
      setGpsLoading(true);
      try {
        const coords = await refreshCustomerLocation({ askPermissionIfNeeded: true });
        if (wipCancelledRef.current) {
          return;
        }
        if (coords) {
          await applyCoords(coords, { forceReverse: true });
        } else {
          setGpsDeniedOrFailed(true);
        }

        if (wipCancelledRef.current) {
          return;
        }

        const stop = await watchCustomerLocation((c) => {
          void applyCoords(c);
        });
        if (!wipCancelledRef.current && stop) {
          removeWatch = stop;
        }
      } catch {
        if (!wipCancelledRef.current) {
          setGpsDeniedOrFailed(true);
        }
      } finally {
        if (!wipCancelledRef.current) {
          setGpsLoading(false);
        }
      }
    })();

    return () => {
      wipCancelledRef.current = true;
      removeWatch?.();
    };
  }, [active, applyCoords]);

  const runGps = useCallback(async () => {
    setGpsLoading(true);
    setGpsDeniedOrFailed(false);
    try {
      const coords = await refreshCustomerLocation({ askPermissionIfNeeded: true });
      if (!coords) {
        setGpsProvince(null);
        setGpsDeniedOrFailed(true);
        return;
      }
      lastReverseRef.current = null;
      await applyCoords(coords, { forceReverse: true });
    } catch {
      setGpsProvince(null);
      setGpsDeniedOrFailed(true);
    } finally {
      setGpsLoading(false);
    }
  }, [applyCoords]);

  const filteredCities = useMemo(
    () =>
      VIETNAM_PROVINCES.filter((city) =>
        city.toLowerCase().includes(cityQuery.trim().toLowerCase()),
      ),
    [cityQuery],
  );

  const currentLabel = gpsLoading
    ? isEn
      ? 'Detecting…'
      : 'Đang xác định…'
    : gpsProvince
      ? gpsProvince
      : gpsDeniedOrFailed
        ? isEn
          ? 'Could not detect'
          : 'Không xác định được'
        : isEn
          ? '—'
          : '—';

  const onPickGpsProvince = () => {
    if (gpsProvince) {
      onSelectCity(gpsProvince);
    }
  };

  return (
    <View style={styles.root}>
      <View style={styles.searchRow}>
        <Feather name="search" size={16} color="#888" />
        <TextInput
          style={styles.searchInput}
          placeholder={isEn ? 'Search province/city...' : 'Tìm tỉnh/thành...'}
          placeholderTextColor="#999"
          value={cityQuery}
          onChangeText={setCityQuery}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
        />
      </View>

      <View style={styles.currentBlock}>
        <TouchableOpacity
          style={styles.currentMain}
          onPress={onPickGpsProvince}
          activeOpacity={gpsProvince ? 0.75 : 1}
          disabled={!gpsProvince}
        >
          <Feather name="crosshair" size={18} color={TARGET} style={styles.currentIcon} />
          <View style={styles.currentTextCol}>
            <Text style={styles.currentTitle}>
              {isEn ? 'Current location' : 'Vị trí hiện tại'}
            </Text>
            <Text style={[styles.currentCity, !gpsProvince && !gpsLoading && styles.currentCityMuted]}>
              {currentLabel}
            </Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.refreshBtn}
          onPress={() => void runGps()}
          disabled={gpsLoading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          {gpsLoading ? (
            <ActivityIndicator size="small" color={accentColor} />
          ) : (
            <>
              <Feather name="refresh-cw" size={16} color={accentColor} />
              <Text style={[styles.refreshText, { color: accentColor }]}>
                {isEn ? 'Refresh' : 'Cập nhật lại'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      <FlatList
        data={filteredCities}
        keyExtractor={(item) => item}
        keyboardShouldPersistTaps="handled"
        style={styles.list}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => {
          const activeRow = item === selectedCity;
          return (
            <TouchableOpacity
              style={[styles.row, activeRow && { backgroundColor: `${accentColor}18` }]}
              onPress={() => onSelectCity(item)}
              activeOpacity={0.85}
            >
              <Feather name="map-pin" size={16} color={PIN} style={styles.pin} />
              <Text style={[styles.rowText, activeRow && { color: accentColor, fontWeight: '700' }]}>
                {item}
              </Text>
              {activeRow ? (
                <Feather name="check" size={18} color={accentColor} style={styles.check} />
              ) : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {isEn ? 'No matching province/city' : 'Không tìm thấy tỉnh/thành phù hợp'}
          </Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 200,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F4F4',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: '#222',
    padding: 0,
  },
  currentBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 4,
    marginBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E8E8E8',
  },
  currentMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  currentIcon: {
    marginTop: 2,
  },
  currentTextCol: {
    flex: 1,
  },
  currentTitle: {
    fontSize: 13,
    color: '#666',
    marginBottom: 2,
  },
  currentCity: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111',
  },
  currentCityMuted: {
    color: '#999',
    fontWeight: '600',
  },
  refreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 8,
  },
  refreshText: {
    fontSize: 13,
    fontWeight: '600',
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEFEF',
  },
  pin: {
    marginRight: 10,
  },
  rowText: {
    flex: 1,
    fontSize: 16,
    color: '#222',
  },
  check: {
    marginLeft: 8,
  },
  empty: {
    textAlign: 'center',
    color: '#999',
    paddingVertical: 24,
    fontSize: 14,
  },
});
