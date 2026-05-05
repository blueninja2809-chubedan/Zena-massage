/**
 * Bản đồ Mapbox (@rnmapbox/maps) — màn quét KTV.
 * Cần dev client + `npx expo prebuild` (plugin `@rnmapbox/maps`), token runtime `EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN` (pk.*).
 * Token tải SDK: `RNMAPBOX_MAPS_DOWNLOAD_TOKEN` hoặc `MAPBOX_DOWNLOADS_TOKEN` khi prebuild (xem app.config.ts).
 *
 * Tài liệu / lỗi liên quan vị trí & kích thước:
 * - Mapbox iOS camera: https://docs.mapbox.com/ios/maps/guides/camera-and-animation/
 * - RN: MapView cần kích thước hợp lệ trước khi render; nếu không sẽ log `Invalid size … {64,64}` (maps-core fallback).
 * - RN Camera `defaultSettings` có thể sai lần đầu: https://github.com/rnmapbox/maps/issues/3449
 * - GPS thiết bị trên map (Mapbox): https://rnmapbox.github.io/docs/components/UserLocation
 */
import { AppColors } from '@/constants/appColors';
import { scheduleNonBlockingWork } from '@/lib/scheduleNonBlockingWork';
import Mapbox, { Camera, FillLayer, LineLayer, MapView, MarkerView, ShapeSource, UserLocation } from '@rnmapbox/maps';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import BookingFindingHeaderOverlay from './BookingFindingHeaderOverlay';
import {
  getDistanceKm,
  TechMarkerBubble,
  UserMarkerBubble,
  type BookingMapFindingViewMapProps,
} from './BookingMapFindingViewMap';

const { height: SCREEN_H } = Dimensions.get('window');

const BOOKING_SHEET_HEIGHT_RATIO = 0.52;
const GLOW_RADIUS_INNER = 220;
const GLOW_RADIUS_OUTER = 420;

function BookingMapUserSweepMarker({ uri, name }: { uri?: string | null; name: string }) {
  const sweepAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 2800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => {
      loop.stop();
    };
  }, [sweepAnim]);
  const rotate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const disk = 268;
  const radarCenter = disk / 2;
  return (
    <View
      style={{ width: disk, height: disk, alignItems: 'center', justifyContent: 'center' }}
      collapsable={false}
    >
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: disk,
          height: disk,
          transform: [{ rotate }],
        }}
      >
        <LinearGradient
          colors={['rgba(13, 180, 108, 0.03)', 'rgba(13, 180, 108, 0.18)', 'rgba(13, 180, 108, 0.38)']}
          locations={[0, 0.62, 1]}
          start={{ x: 0.5, y: 0.5 }}
          end={{ x: 0.5, y: 0 }}
          style={{
            position: 'absolute',
            left: radarCenter - 30,
            top: 4,
            width: 60,
            height: radarCenter - 4,
            borderTopLeftRadius: 30,
            borderTopRightRadius: 30,
          }}
        />
        <View
          style={{
            position: 'absolute',
            left: radarCenter - 2,
            top: 10,
            width: 4,
            height: radarCenter - 22,
            borderRadius: 2,
            backgroundColor: 'rgba(13, 180, 108, 0.92)',
          }}
        />
      </Animated.View>
      <UserMarkerBubble uri={uri} name={name} />
    </View>
  );
}

type CameraRef = React.ElementRef<typeof Camera>;

function circlePolygonFeature(center: { latitude: number; longitude: number }, radiusMeters: number) {
  const lng = center.longitude;
  const lat = center.latitude;
  const steps = 72;
  const ring: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dy = radiusMeters / 110540;
  const dx = radiusMeters / (111320 * Math.cos(latRad || 1e-6));
  for (let i = 0; i <= steps; i += 1) {
    const theta = (i / steps) * 2 * Math.PI;
    ring.push([lng + dx * Math.cos(theta), lat + dy * Math.sin(theta)]);
  }
  return {
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'Polygon' as const, coordinates: [ring] },
  };
}

export default function BookingMapFindingViewMapbox(props: BookingMapFindingViewMapProps) {
  const {
    userCenter,
    markers,
    selectedId,
    onSelectTech,
    topInset,
    cityLabel,
    onBack,
    onCancel,
    cancelLabel,
    mainTitle,
    subTitle,
    statusPillText,
    headerVariant = 'default',
    userAvatarUri,
    userDisplayName = '',
    onNativeGpsLocation,
  } = props;

  const cameraRef = useRef<CameraRef>(null);
  const mountedRef = useRef(true);
  const lastNativeEmitRef = useRef<{ latitude: number; longitude: number } | null>(null);
  const [mapboxReady, setMapboxReady] = useState(false);
  /** Fix từ Mapbox UserLocation (Core Location) — ưu tiên hơn props từ JS nếu đã có. */
  const [nativeGpsCenter, setNativeGpsCenter] = useState<{ latitude: number; longitude: number } | null>(null);
  /** Mapbox Maps iOS: nếu MapView mount lúc width/height = 0 → log "Invalid size … {64,64}" và camera sai. Chỉ mount sau onLayout đã ổn định. */
  const [mapLayout, setMapLayout] = useState({ width: 0, height: 0 });
  /** Yêu cầu kích thước "thật" (≥ 120px) để không trùng default-fallback {64,64} của Mapbox. */
  const [mapSurfaceCommitted, setMapSurfaceCommitted] = useState(false);
  const layoutReady =
    mapSurfaceCommitted && mapLayout.width >= 120 && mapLayout.height >= 120;
  /**
   * Chỉ mount overlay (UserLocation/MarkerView/ShapeSource) SAU khi style của MapView đã load xong.
   * Mount đồng thời lúc đầu sẽ khiến các con query layout/location trước khi native frame ổn định
   * → Mapbox fallback `{64,64}` và log lỗi `[MapboxCommon] Invalid size`.
   */
  const [mapStyleLoaded, setMapStyleLoaded] = useState(false);

  const accessToken = (process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN || '').trim();

  const mapUserCenter = useMemo(
    () => nativeGpsCenter ?? userCenter,
    [nativeGpsCenter, userCenter],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    if (!accessToken.startsWith('pk.')) {
      setMapboxReady(false);
      return () => {
        cancelled = true;
      };
    }
    void (async () => {
      try {
        await Mapbox.setAccessToken(accessToken);
        if (!cancelled && mountedRef.current) setMapboxReady(true);
      } catch {
        if (!cancelled && mountedRef.current) setMapboxReady(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const sheetBottomPad = useMemo(() => SCREEN_H * BOOKING_SHEET_HEIGHT_RATIO + 36, []);

  const validMarkers = useMemo(
    () =>
      markers.filter(
        (m) =>
          Number.isFinite(m.latitude) &&
          Number.isFinite(m.longitude) &&
          Math.abs(m.latitude) <= 90 &&
          Math.abs(m.longitude) <= 180,
      ),
    [markers],
  );

  const glowOuter = useMemo(
    () => circlePolygonFeature(mapUserCenter, GLOW_RADIUS_OUTER),
    [mapUserCenter],
  );
  const glowInner = useMemo(
    () => circlePolygonFeature(mapUserCenter, GLOW_RADIUS_INNER),
    [mapUserCenter],
  );

  /** Đường nối khách ↔ KTV được chọn (đường chim bay = haversine / km hiển thị) */
  const assignedRouteFeature = useMemo(() => {
    const assigned = validMarkers.find((m) => m.isAssigned);
    if (!assigned) return null;
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [mapUserCenter.longitude, mapUserCenter.latitude],
          [assigned.longitude, assigned.latitude],
        ],
      },
    };
  }, [mapUserCenter.latitude, mapUserCenter.longitude, validMarkers]);

  const fitMapToData = useCallback(() => {
    if (!mountedRef.current || !cameraRef.current || !layoutReady) return;
    const coords = [
      { latitude: mapUserCenter.latitude, longitude: mapUserCenter.longitude },
      ...validMarkers.map((m) => ({ latitude: m.latitude, longitude: m.longitude })),
    ];
    const topPad = headerVariant === 'compact' ? 112 : 200;
    if (coords.length === 1) {
      cameraRef.current.setCamera({
        centerCoordinate: [mapUserCenter.longitude, mapUserCenter.latitude],
        zoomLevel: 13,
        animationDuration: 380,
      });
      return;
    }
    let minLat = 90;
    let maxLat = -90;
    let minLng = 180;
    let maxLng = -180;
    for (const c of coords) {
      minLat = Math.min(minLat, c.latitude);
      maxLat = Math.max(maxLat, c.latitude);
      minLng = Math.min(minLng, c.longitude);
      maxLng = Math.max(maxLng, c.longitude);
    }
    cameraRef.current.setCamera({
      bounds: {
        ne: [maxLng, maxLat],
        sw: [minLng, minLat],
        paddingTop: topPad,
        paddingRight: 64,
        paddingBottom: sheetBottomPad,
        paddingLeft: 20,
      },
      animationDuration: 400,
    });
  }, [
    layoutReady,
    mapUserCenter.latitude,
    mapUserCenter.longitude,
    validMarkers,
    headerVariant,
    sheetBottomPad,
  ]);

  const onMapLoaded = useCallback(() => {
    if (mountedRef.current) setMapStyleLoaded(true);
    fitMapToData();
    scheduleNonBlockingWork(() => {
      if (mountedRef.current) {
        fitMapToData();
      }
    });
  }, [fitMapToData]);

  // Khi MapView bị unmount (layoutReady=false do remount/HMR), reset style flag để overlay không
  // render trước khi MapView mới load xong style → tránh `Invalid size … {64,64}` quay lại.
  useEffect(() => {
    if (!layoutReady && mapStyleLoaded) {
      setMapStyleLoaded(false);
    }
  }, [layoutReady, mapStyleLoaded]);

  useEffect(() => {
    if (!mapboxReady || !layoutReady) return;
    const t = setTimeout(fitMapToData, 400);
    return () => clearTimeout(t);
  }, [mapboxReady, layoutReady, validMarkers.length, mapUserCenter.latitude, mapUserCenter.longitude, fitMapToData]);

  useEffect(() => {
    if (!mapboxReady || !layoutReady || selectedId) return;
    const t = setTimeout(fitMapToData, 320);
    return () => clearTimeout(t);
  }, [mapboxReady, layoutReady, selectedId, fitMapToData]);

  useEffect(() => {
    if (!mapboxReady || !layoutReady || !mountedRef.current || !selectedId || !cameraRef.current) return;
    const tech = validMarkers.find((m) => m.id === selectedId);
    if (!tech) return;
    cameraRef.current.setCamera({
      centerCoordinate: [tech.longitude, tech.latitude],
      zoomLevel: 14,
      animationDuration: 420,
    });
  }, [mapboxReady, layoutReady, selectedId, validMarkers]);

  function centerToUser() {
    if (!mountedRef.current || !cameraRef.current || !layoutReady) return;
    cameraRef.current.setCamera({
      centerCoordinate: [mapUserCenter.longitude, mapUserCenter.latitude],
      zoomLevel: 13,
      animationDuration: 480,
    });
  }

  const handleNativeUserLocation = useCallback(
    (location: { coords: { latitude: number; longitude: number } }) => {
      const lat = location.coords.latitude;
      const lng = location.coords.longitude;
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
      const next = { latitude: lat, longitude: lng };
      setNativeGpsCenter(next);
      const prev = lastNativeEmitRef.current;
      const movedKm = prev ? getDistanceKm(prev, next) : 999;
      if (!prev || movedKm >= 0.05) {
        lastNativeEmitRef.current = next;
        onNativeGpsLocation?.(next);
      }
    },
    [onNativeGpsLocation],
  );

  if (!accessToken.startsWith('pk.') || !mapboxReady) {
    return (
      <View style={styles.fill}>
        <View style={styles.loadingBody}>
          <Text style={styles.loadingText}>
            {!accessToken.startsWith('pk.')
              ? 'Thiếu EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN (pk.*).'
              : 'Đang khởi tạo Mapbox...'}
          </Text>
        </View>
        <BookingFindingHeaderOverlay
          topInset={topInset}
          onBack={onBack}
          onCancel={onCancel}
          cancelLabel={cancelLabel}
          cityLabel={cityLabel}
          mainTitle={mainTitle}
          subTitle={subTitle}
          statusPillText={statusPillText}
          variant={headerVariant}
        />
      </View>
    );
  }

  return (
    <View
      style={styles.fill}
      onLayout={(e) => {
        const w = Math.round(e.nativeEvent.layout.width);
        const h = Math.round(e.nativeEvent.layout.height);
        if (w < 120 || h < 120) {
          return;
        }
        setMapLayout((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
        if (!mapSurfaceCommitted) {
          // Đợi 1 frame sau khi parent (vd. Modal slide) ổn định layout rồi mới mount MapView
          // (tránh native frame {0,0} → cảnh báo Mapbox "Invalid size {64,64}").
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              if (mountedRef.current) setMapSurfaceCommitted(true);
            });
          });
        }
      }}
    >
      {!layoutReady ? (
        <View style={styles.loadingBody}>
          <Text style={styles.loadingText}>Đang chuẩn bị bản đồ…</Text>
        </View>
      ) : (
        <MapView
          // QUAN TRỌNG: dùng flex:1 thay vì { width, height } numeric.
          // Mapbox iOS đọc frame thật từ parent (đã được đo qua onLayout). Nếu set numeric width/height
          // từ state, mỗi lần state đổi → re-layout MapView, có thể trùng thời điểm native frame còn 0
          // → fallback `{64,64}` và log `[MapboxCommon] Invalid size`.
          style={styles.fill}
          styleURL={Mapbox.StyleURL.Street}
          compassEnabled={false}
          scaleBarEnabled={false}
          scrollEnabled={false}
          zoomEnabled={false}
          rotateEnabled={false}
          pitchEnabled={false}
          onDidFinishLoadingMap={onMapLoaded}
        >
          {/* Không dùng defaultSettings: lần render đầu có thể sai vị trí (Mapbox Studio default / issue rnmapbox#3449). Camera set sau load + layout. */}
          <Camera ref={cameraRef} />

          {/*
            Defer toàn bộ overlay (ShapeSource/UserLocation/MarkerView) cho tới khi style của MapView
            load xong (`onDidFinishLoadingMap`). Nếu mount đồng thời, các con query layout/location
            trước khi native frame ổn định → Mapbox log `Invalid size … {64,64}`.
          */}
          {mapStyleLoaded ? (
            <>
              <ShapeSource id="bookingUserGlowOuter" shape={glowOuter}>
                <FillLayer
                  id="bookingUserGlowOuterFill"
                  style={{
                    fillColor: 'rgba(13, 180, 108, 0.06)',
                    fillOutlineColor: 'rgba(13, 180, 108, 0.12)',
                  }}
                />
              </ShapeSource>
              <ShapeSource id="bookingUserGlowInner" shape={glowInner}>
                <FillLayer
                  id="bookingUserGlowInnerFill"
                  style={{
                    fillColor: 'rgba(13, 180, 108, 0.1)',
                    fillOutlineColor: 'rgba(13, 180, 108, 0.38)',
                  }}
                />
              </ShapeSource>

              {assignedRouteFeature ? (
                <ShapeSource id="bookingUserToAssignedLine" shape={assignedRouteFeature}>
                  <LineLayer
                    id="bookingUserToAssignedLineLayer"
                    style={{
                      lineColor: 'rgba(95, 143, 71, 0.88)',
                      lineWidth: 3,
                      lineDasharray: [1.5, 1.5],
                    }}
                  />
                </ShapeSource>
              ) : null}

              {/* `onUpdate` vẫn bật location manager khi `visible={false}` — không vẽ puck mặc định, chỉ dùng GPS cho marker custom. */}
              <UserLocation visible={false} minDisplacement={3} onUpdate={handleNativeUserLocation} />

              {validMarkers.map((tech) => (
                <MarkerView
                  key={tech.id}
                  coordinate={[tech.longitude, tech.latitude]}
                  anchor={{ x: 0.5, y: 0.5 }}
                  allowOverlap
                  allowOverlapWithPuck={false}
                  isSelected={selectedId === tech.id}
                >
                  <Pressable onPress={() => onSelectTech(tech.id)} hitSlop={10}>
                    <TechMarkerBubble
                      tech={tech}
                      selected={selectedId === tech.id}
                      userCenter={mapUserCenter}
                      showDistanceAlways
                    />
                  </Pressable>
                </MarkerView>
              ))}

              <MarkerView
                coordinate={[mapUserCenter.longitude, mapUserCenter.latitude]}
                anchor={{ x: 0.5, y: 0.5 }}
                allowOverlap
                allowOverlapWithPuck={false}
                isSelected={false}
              >
                <BookingMapUserSweepMarker uri={userAvatarUri} name={userDisplayName} />
              </MarkerView>
            </>
          ) : null}
        </MapView>
      )}

      <BookingFindingHeaderOverlay
        topInset={topInset}
        onBack={onBack}
        onCancel={onCancel}
        cancelLabel={cancelLabel}
        cityLabel={cityLabel}
        mainTitle={mainTitle}
        subTitle={subTitle}
        statusPillText={statusPillText}
        variant={headerVariant}
      />

      <View
        style={[
          styles.rightActions,
          {
            top: Math.min(
              topInset + (headerVariant === 'compact' ? 120 : 200),
              SCREEN_H * (headerVariant === 'compact' ? 0.22 : 0.28),
            ),
          },
        ]}
      >
        <Pressable style={styles.floatingButton} onPress={centerToUser}>
          <Ionicons name="locate" size={22} color={AppColors.text} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    backgroundColor: AppColors.bg,
  },
  loadingBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    color: AppColors.textMuted,
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  rightActions: {
    position: 'absolute',
    right: 16,
    zIndex: 4,
  },
  floatingButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: AppColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});
