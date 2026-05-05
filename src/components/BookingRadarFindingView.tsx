/**
 * Radar quét KTV quanh khách — hiệu ứng + màu theo AppColors (Zena).
 */
import { AppColors } from '@/constants/appColors';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;

export type BookingRadarMarker = {
  id: string;
  name: string;
  avatar: string;
  latitude: number;
  longitude: number;
  rating: number;
  reviewCount: number;
  isAssigned?: boolean;
};

type LatLng = { latitude: number; longitude: number };

type RadarPoint = BookingRadarMarker & {
  distanceKm: number;
  radarLeft: number;
  radarTop: number;
};

const MARKER_SIZE = 54;
const MAX_DISTANCE_KM = 8;

function toRad(value: number) {
  return (value * Math.PI) / 180;
}

function toDeg(value: number) {
  return (value * 180) / Math.PI;
}

function getDistanceKm(from: LatLng, to: LatLng): number {
  const R = 6371;
  const dLat = toRad(to.latitude - from.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function getBearingDeg(from: LatLng, to: LatLng): number {
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const dLon = toRad(to.longitude - from.longitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

type Props = {
  userCenter: LatLng;
  markers: BookingRadarMarker[];
  selectedId?: string | null;
  onMarkerPress?: (id: string) => void;
  /** Nền bản đồ phía sau — đĩa radar trong suốt hơn, căn giữa màn */
  embeddedOnMap?: boolean;
  userAvatarUri?: string | null;
  userDisplayName?: string;
};

export default function BookingRadarFindingView({
  userCenter,
  markers,
  selectedId = null,
  onMarkerPress,
  embeddedOnMap = false,
  userAvatarUri,
  userDisplayName = '',
}: Props) {
  const sweepAnim = useRef(new Animated.Value(0)).current;
  const haloAnim = useRef(new Animated.Value(0)).current;
  const ringBreath = useRef(new Animated.Value(0)).current;

  const radarSize = useMemo(() => Math.min(SCREEN_WIDTH - 44, 355), []);
  const radarCenter = radarSize / 2;

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1,
        duration: 2400,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const halo = Animated.loop(
      Animated.sequence([
        Animated.timing(haloAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(haloAnim, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(ringBreath, {
          toValue: 1,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(ringBreath, {
          toValue: 0,
          duration: 2400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    sweep.start();
    halo.start();
    breath.start();
    return () => {
      sweep.stop();
      halo.stop();
      breath.stop();
    };
  }, [haloAnim, ringBreath, sweepAnim]);

  const radarTechnicians = useMemo<RadarPoint[]>(() => {
    return markers
      .map((tech) => {
        const techLocation = { latitude: tech.latitude, longitude: tech.longitude };
        const distanceKm = getDistanceKm(userCenter, techLocation);
        const bearingDeg = getBearingDeg(userCenter, techLocation);
        const maxRadarRadius = radarCenter - MARKER_SIZE / 2 - 14;
        const radius = Math.min(distanceKm / MAX_DISTANCE_KM, 1) * maxRadarRadius;
        const angle = toRad(bearingDeg);
        const radarLeft = radarCenter + Math.sin(angle) * radius - MARKER_SIZE / 2;
        const radarTop = radarCenter - Math.cos(angle) * radius - MARKER_SIZE / 2;
        return { ...tech, distanceKm, radarLeft, radarTop };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [markers, userCenter, radarCenter]);

  const sweepRotate = sweepAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const haloOpacity = haloAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.14, 0.38],
  });

  const ringBreathOpacity = ringBreath.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.7],
  });

  /** Trên MapView: đĩa gần như trong suốt để thấy đường phố; fallback radar vẫn dùng nền kem đặc */
  const diskGradientColors = embeddedOnMap
    ? ['rgba(255,255,255,0.06)', 'rgba(255,255,255,0.04)', 'rgba(255,255,255,0.07)']
    : [AppColors.accentSoft2, '#FAFDFB', AppColors.primarySoft2];

  return (
    <View style={[styles.radarOuter, embeddedOnMap && styles.radarOuterEmbedded]}>
      <View style={[styles.radar, { width: radarSize, height: radarSize, borderRadius: radarSize / 2 }]}>
        <LinearGradient
          colors={diskGradientColors}
          locations={[0, 0.45, 1]}
          start={{ x: 0.2, y: 0 }}
          end={{ x: 0.8, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: radarSize / 2 }]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.haloRing,
            {
              width: radarSize * 1.08,
              height: radarSize * 1.08,
              borderRadius: (radarSize * 1.08) / 2,
              left: radarSize * (1 - 1.08) / 2,
              top: radarSize * (1 - 1.08) / 2,
              opacity: haloOpacity,
            },
          ]}
        />

        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            {
              width: radarSize * 0.9,
              height: radarSize * 0.9,
              opacity: ringBreathOpacity,
            },
          ]}
        />
        <View style={[styles.ring, { width: radarSize * 0.68, height: radarSize * 0.68 }]} />
        <View style={[styles.ring, { width: radarSize * 0.46, height: radarSize * 0.46 }]} />
        <View style={[styles.ring, { width: radarSize * 0.25, height: radarSize * 0.25 }]} />

        {/* Vệt radar hẹp + kim quay 360° */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sweep,
            {
              width: radarSize,
              height: radarSize,
              borderRadius: radarSize / 2,
              transform: [{ rotate: sweepRotate }],
            },
          ]}
        >
          <LinearGradient
            colors={['rgba(13, 180, 108, 0.02)', 'rgba(13, 180, 108, 0.22)', 'rgba(13, 180, 108, 0.45)']}
            locations={[0, 0.65, 1]}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 0.5, y: 0 }}
            style={[
              styles.radarWedge,
              {
                left: radarCenter - 26,
                top: 0,
                width: 52,
                height: radarCenter,
                borderTopLeftRadius: 26,
                borderTopRightRadius: 26,
              },
            ]}
          />
          <View
            style={[
              styles.radarNeedle,
              {
                left: radarCenter - 1.5,
                top: 6,
                width: 3,
                height: radarCenter - 14,
              },
            ]}
          />
        </Animated.View>

        {/* Khách: marker tròn + avatar (không dùng ô gradient xanh ở tâm) */}
        <View
          pointerEvents="none"
          style={[
            styles.marker,
            styles.userMarkerCenter,
            {
              left: radarCenter - MARKER_SIZE / 2,
              top: radarCenter - MARKER_SIZE / 2,
            },
          ]}
        >
          {userAvatarUri ? (
            <Image source={{ uri: userAvatarUri }} style={styles.markerAvatar} />
          ) : (
            <View style={styles.markerFallback}>
              <Text style={styles.markerFallbackText}>
                {(userDisplayName || '?').trim().slice(0, 1).toUpperCase() || '?'}
              </Text>
            </View>
          )}
        </View>

        {radarTechnicians.map((tech) => {
          const active = selectedId === tech.id;
          return (
            <Pressable
              key={tech.id}
              onPress={() => onMarkerPress?.(tech.id)}
              style={[
                styles.marker,
                {
                  left: tech.radarLeft,
                  top: tech.radarTop,
                  transform: [{ scale: active ? 1.08 : 1 }],
                },
              ]}
            >
              {tech.avatar ? (
                <Image
                  source={{ uri: tech.avatar }}
                  style={[styles.markerAvatar, tech.isAssigned && styles.markerAvatarAssigned]}
                />
              ) : (
                <View style={[styles.markerFallback, tech.isAssigned && styles.markerAvatarAssigned]}>
                  <Text style={styles.markerFallbackText}>{tech.name.slice(0, 1)}</Text>
                </View>
              )}
              <View style={styles.markerOnline} />
              {active ? (
                <View style={styles.distanceBadge}>
                  <Text style={styles.distanceBadgeText}>{tech.distanceKm.toFixed(1)} km</Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  radarOuter: {
    alignItems: 'center',
    marginTop: 6,
    height: Math.min(SCREEN_WIDTH - 44, 355) * 0.94,
    justifyContent: 'center',
  },
  radarOuterEmbedded: {
    marginTop: 0,
    height: undefined,
    minHeight: 0,
    flexGrow: 0,
    justifyContent: 'center',
  },
  radar: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(13, 180, 108, 0.18)',
    shadowColor: AppColors.accent,
    shadowOpacity: 0.22,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  haloRing: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: 'rgba(13, 180, 108, 0.38)',
    backgroundColor: 'transparent',
  },
  ring: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: 'rgba(255,255,255,0.75)',
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  sweep: {
    position: 'absolute',
  },
  radarWedge: {
    position: 'absolute',
  },
  radarNeedle: {
    position: 'absolute',
    borderRadius: 2,
    backgroundColor: 'rgba(13, 180, 108, 0.95)',
    shadowColor: AppColors.accent,
    shadowOpacity: 0.45,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  userMarkerCenter: {
    zIndex: 2,
    borderWidth: 2,
    borderColor: AppColors.accent,
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    backgroundColor: AppColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 5,
  },
  markerAvatar: {
    width: MARKER_SIZE - 8,
    height: MARKER_SIZE - 8,
    borderRadius: (MARKER_SIZE - 8) / 2,
    backgroundColor: AppColors.primarySoft2,
  },
  markerAvatarAssigned: {
    borderWidth: 3,
    borderColor: AppColors.primary,
  },
  markerFallback: {
    width: MARKER_SIZE - 8,
    height: MARKER_SIZE - 8,
    borderRadius: (MARKER_SIZE - 8) / 2,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerFallbackText: {
    color: AppColors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  markerOnline: {
    position: 'absolute',
    right: 2,
    bottom: 3,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: AppColors.accent,
    borderWidth: 2.5,
    borderColor: AppColors.white,
  },
  distanceBadge: {
    position: 'absolute',
    bottom: -24,
    backgroundColor: AppColors.text,
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 12,
  },
  distanceBadgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: '800',
  },
});
