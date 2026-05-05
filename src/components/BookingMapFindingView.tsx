/**
 * Màn tìm KTV: Mapbox + marker (dev client, EXPO_PUBLIC_ENABLE_NATIVE_MAPS≠false).
 * Expo Go / env=false → ảnh OSM tĩnh + radar (tránh crash thiếu native @rnmapbox/maps).
 */
import { AppColors } from '@/constants/appColors';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Dimensions, Image, Platform, StyleSheet, Text, View } from 'react-native';

import BookingFindingHeaderOverlay from './BookingFindingHeaderOverlay';
import BookingRadarFindingView from './BookingRadarFindingView';
import type { BookingRadarMarker } from './BookingRadarFindingView';

const MapboxImpl = lazy(() => import('./BookingMapFindingViewMapbox'));

/** Trùng với bottom sheet trong BookingConfirmScreen (~52% màn) — căn radar giữa *vùng bản đồ* hiển thị */
const BOOKING_SHEET_HEIGHT_RATIO = 0.52;

type LatLng = { latitude: number; longitude: number };

export type BookingMapFindingViewProps = {
  userCenter: LatLng;
  markers: BookingRadarMarker[];
  selectedId: string | null;
  onSelectTech: (id: string) => void;
  topInset: number;
  cityLabel: string;
  /** Tuỳ chọn — không truyền sẽ ẩn nút back trên header. */
  onBack?: () => void;
  onCancel: () => void;
  cancelLabel: string;
  mainTitle: string;
  subTitle: string;
  statusPillText: string;
  /** 'compact' = ít chữ trên bản đồ, giống app đặt xe */
  headerVariant?: 'default' | 'compact';
  /** Avatar khách ở tâm radar / marker vị trí trên bản đồ */
  userAvatarUri?: string | null;
  userDisplayName?: string;
  /** Chỉ Mapbox: GPS native qua `UserLocation.onUpdate` → đồng bộ radar. */
  onNativeGpsLocation?: (coords: LatLng) => void;
};

function shouldLoadNativeMaps(): boolean {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return false;
  // Expo Go: không nạp @rnmapbox/maps (thiếu native → crash nếu mount MapView).
  if (Constants.appOwnership === 'expo') return false;
  // Cho phép tắt MapView khi cần (Expo Go build lạ / test) — mặc định bật khi env không phải 'false'.
  if (String(process.env.EXPO_PUBLIC_ENABLE_NATIVE_MAPS || '').toLowerCase() === 'false') {
    return false;
  }
  return true;
}

/**
 * Nền bản đồ dạng PNG (OSM static) — tránh WebView iframe OSM hay crash iOS / simulator.
 * Nếu tải ảnh lỗi → gradient an toàn.
 */
function OsmStaticMapBackdrop({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const [failed, setFailed] = useState(false);
  const [uriIndex, setUriIndex] = useState(0);
  const lat = Number.isFinite(latitude) ? latitude : 21.0285;
  const lng = Number.isFinite(longitude) ? longitude : 105.8542;
  const { width: w, height: h } = Dimensions.get('window');
  const mapW = Math.min(1024, Math.max(480, Math.round(w * 2)));
  const mapH = Math.min(1024, Math.max(480, Math.round(h * 2)));
  const uris = useMemo(() => {
    const osm = `https://staticmap.openstreetmap.de/staticmap.php?center=${encodeURIComponent(`${lat},${lng}`)}&zoom=15&size=${mapW}x${mapH}&maptype=mapnik`;
    const yw = Math.min(650, Math.max(320, Math.round(w * 1.8)));
    const yh = Math.min(650, Math.max(320, Math.round(h * 1.8)));
    const yandex = `https://static-maps.yandex.ru/1.x/?ll=${encodeURIComponent(`${lng},${lat}`)}&size=${yw},${yh}&z=14&l=map`;
    return [osm, yandex];
  }, [lat, lng, mapW, mapH, w, h]);

  if (failed) {
    return (
      <LinearGradient
        colors={[AppColors.accentSoft2, AppColors.accentSoft, AppColors.bg]}
        locations={[0, 0.35, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
    );
  }

  return (
    <Image
      key={uriIndex}
      source={{ uri: uris[uriIndex] ?? uris[0] }}
      style={styles.mapImage}
      resizeMode="cover"
      pointerEvents="none"
      onError={() => {
        if (uriIndex < uris.length - 1) setUriIndex(uriIndex + 1);
        else setFailed(true);
      }}
    />
  );
}

function RadarFallback(props: BookingMapFindingViewProps) {
  const { latitude, longitude } = props.userCenter;
  const sheetPad = Dimensions.get('window').height * BOOKING_SHEET_HEIGHT_RATIO;

  return (
    <View style={styles.fallbackRoot}>
      <OsmStaticMapBackdrop latitude={latitude} longitude={longitude} />
      <View style={styles.fallbackTint} pointerEvents="none" />
      <BookingFindingHeaderOverlay
        topInset={props.topInset}
        onBack={props.onBack}
        onCancel={props.onCancel}
        cancelLabel={props.cancelLabel}
        cityLabel={props.cityLabel}
        mainTitle={props.mainTitle}
        subTitle={props.subTitle}
        statusPillText={props.statusPillText}
        variant={props.headerVariant}
      />
      <View style={[styles.radarWrap, { paddingBottom: sheetPad }]}>
        <BookingRadarFindingView
          userCenter={props.userCenter}
          markers={props.markers}
          selectedId={props.selectedId}
          onMarkerPress={props.onSelectTech}
          embeddedOnMap
          userAvatarUri={props.userAvatarUri}
          userDisplayName={props.userDisplayName}
        />
      </View>
    </View>
  );
}

function hasValidMapCenter(center: LatLng): boolean {
  const { latitude: lat, longitude: lng } = center;
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180
  );
}

export default function BookingMapFindingView(props: BookingMapFindingViewProps) {
  const loadMaps = shouldLoadNativeMaps() && hasValidMapCenter(props.userCenter);

  if (Platform.OS === 'web') {
    return (
      <View style={styles.webRoot}>
        <Text style={styles.webText}>Bản đồ chỉ hỗ trợ trên iOS / Android.</Text>
      </View>
    );
  }

  if (!loadMaps) {
    return <RadarFallback {...props} />;
  }

  return (
    <Suspense fallback={<RadarFallback {...props} />}>
      <MapboxImpl {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create({
  fallbackRoot: { flex: 1, backgroundColor: AppColors.bg },
  mapImage: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.94,
    backgroundColor: AppColors.bg,
  },
  /** Veil rất nhẹ — để thấy rõ đường phố (ảnh OSM) */
  fallbackTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(246, 241, 234, 0.05)',
  },
  radarWrap: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
  },
  webRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: AppColors.bg,
  },
  webText: {
    color: AppColors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
});
