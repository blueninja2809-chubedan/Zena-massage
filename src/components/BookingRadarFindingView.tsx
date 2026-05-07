/**
 * Radar tìm KTV — frosted-glass, trong suốt, sáng sủa.
 * Tone kem-vàng khớp brand Zena; hiệu ứng ping lan rộng + sweep mềm.
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

const MARKER_SIZE = 52;
const MAX_DISTANCE_KM = 8;

/* ─── Palette ──────────────────────────────────────────────── */
const RING = 'rgba(156,107,63,0.13)';
const RING_MID = 'rgba(156,107,63,0.09)';
const SWEEP_ACCENT = AppColors.accent; // '#0DB46C'

/* ─── Helpers ──────────────────────────────────────────────── */
function toRad(v: number) { return (v * Math.PI) / 180; }
function toDeg(v: number) { return (v * 180) / Math.PI; }

function getDistanceKm(a: LatLng, b: LatLng) {
  const R = 6371;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getBearingDeg(a: LatLng, b: LatLng) {
  const lat1 = toRad(a.latitude), lat2 = toRad(b.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  return (toDeg(Math.atan2(
    Math.sin(dLon) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon),
  )) + 360) % 360;
}

/* ─── Expanding-ring ping ──────────────────────────────────── */
function PingRing({ size, delay, color }: { size: number; delay: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, { toValue: 1, duration: 2600, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.08, 1] });
  const opacity = anim.interpolate({ inputRange: [0, 0.25, 0.8, 1], outputRange: [0, 0.55, 0.2, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: 1.5,
        borderColor: color,
        opacity,
        transform: [{ scale }],
      }}
    />
  );
}

/* ─── Props ────────────────────────────────────────────────── */
type Props = {
  userCenter: LatLng;
  markers: BookingRadarMarker[];
  selectedId?: string | null;
  onMarkerPress?: (id: string) => void;
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
  const sweepAnim  = useRef(new Animated.Value(0)).current;
  const centerPulse = useRef(new Animated.Value(1)).current;

  const radarSize   = useMemo(() => Math.min(SCREEN_WIDTH - 40, 348), []);
  const radarCenter = radarSize / 2;

  useEffect(() => {
    const sweep = Animated.loop(
      Animated.timing(sweepAnim, {
        toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: true,
      }),
    );
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(centerPulse, { toValue: 1.22, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(centerPulse, { toValue: 1,    duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    sweep.start(); pulse.start();
    return () => { sweep.stop(); pulse.stop(); };
  }, [sweepAnim, centerPulse]);

  /* ─── Vị trí KTV trên đĩa radar ───────────────────────────── */
  const radarPoints = useMemo<RadarPoint[]>(() => {
    return markers
      .map((t) => {
        const distanceKm = getDistanceKm(userCenter, t);
        const bearing    = getBearingDeg(userCenter, t);
        const maxR  = radarCenter - MARKER_SIZE / 2 - 10;
        const r     = Math.min(distanceKm / MAX_DISTANCE_KM, 1) * maxR;
        const angle = toRad(bearing);
        return {
          ...t,
          distanceKm,
          radarLeft: radarCenter + Math.sin(angle) * r - MARKER_SIZE / 2,
          radarTop:  radarCenter - Math.cos(angle) * r - MARKER_SIZE / 2,
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [markers, userCenter, radarCenter]);

  const sweepRotate = sweepAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  /* ─── Ring sizes (tỉ lệ đĩa) ───────────────────────────────── */
  const ringRatios = [0.78, 0.56, 0.35];

  return (
    <View style={[styles.outer, embeddedOnMap && styles.outerEmbedded]}>
      {/* Nền đĩa: gradient kem-trắng mờ */}
      <View
        style={[
          styles.disk,
          {
            width: radarSize,
            height: radarSize,
            borderRadius: radarSize / 2,
          },
        ]}
      >
        {/* Nền gradient trong suốt */}
        <LinearGradient
          colors={
            embeddedOnMap
              ? ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.12)']
              : ['rgba(255,252,248,0.96)', 'rgba(246,241,234,0.92)', 'rgba(255,252,248,0.96)']
          }
          start={{ x: 0.15, y: 0 }}
          end={{ x: 0.85, y: 1 }}
          style={[StyleSheet.absoluteFillObject, { borderRadius: radarSize / 2 }]}
        />

        {/* Vòng tròn nền */}
        {ringRatios.map((ratio) => (
          <View
            key={ratio}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: radarSize * ratio,
              height: radarSize * ratio,
              borderRadius: (radarSize * ratio) / 2,
              borderWidth: 1,
              borderColor: RING,
              backgroundColor: RING_MID,
            }}
          />
        ))}

        {/* Ping rings — 3 sóng lan */}
        <PingRing size={radarSize * 0.96} delay={0}    color={SWEEP_ACCENT} />
        <PingRing size={radarSize * 0.96} delay={867}  color={SWEEP_ACCENT} />
        <PingRing size={radarSize * 0.96} delay={1734} color={SWEEP_ACCENT} />

        {/* Sweep quay — gradient mờ dạng quạt */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sweepWrap,
            { width: radarSize, height: radarSize, transform: [{ rotate: sweepRotate }] },
          ]}
        >
          <LinearGradient
            colors={[
              'rgba(13,180,108,0)',
              'rgba(13,180,108,0.04)',
              'rgba(13,180,108,0.18)',
              'rgba(13,180,108,0.36)',
            ]}
            locations={[0, 0.4, 0.75, 1]}
            start={{ x: 0.5, y: 0.5 }}
            end={{ x: 0.5, y: 0 }}
            style={[
              styles.wedge,
              {
                left:   radarCenter - 36,
                top:    0,
                width:  72,
                height: radarCenter,
                borderTopLeftRadius: 36,
                borderTopRightRadius: 36,
              },
            ]}
          />
          {/* Kim quét */}
          <LinearGradient
            colors={['rgba(13,180,108,0)', 'rgba(13,180,108,0.9)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.needle, { left: radarCenter - 1, top: 12, height: radarCenter - 18 }]}
          />
        </Animated.View>

        {/* Marker KTV */}
        {radarPoints.map((tech) => {
          const active = selectedId === tech.id;
          return (
            <Pressable
              key={tech.id}
              onPress={() => onMarkerPress?.(tech.id)}
              style={[
                styles.marker,
                active && styles.markerActive,
                tech.isAssigned && styles.markerAssigned,
                { left: tech.radarLeft, top: tech.radarTop },
              ]}
            >
              {tech.avatar ? (
                <Image source={{ uri: tech.avatar }} style={styles.avatar} />
              ) : (
                <View style={styles.avatarFallback}>
                  <Text style={styles.avatarFallbackText}>{tech.name.slice(0, 1)}</Text>
                </View>
              )}
              {/* Dot xanh "online" */}
              <View style={[styles.onlineDot, tech.isAssigned && styles.onlineDotAssigned]} />
              {/* Badge khoảng cách khi được chọn */}
              {active && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{tech.distanceKm.toFixed(1)} km</Text>
                </View>
              )}
            </Pressable>
          );
        })}

        {/* Marker khách ở tâm — pulse nhẹ */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.marker,
            styles.userMarker,
            {
              left: radarCenter - MARKER_SIZE / 2,
              top:  radarCenter - MARKER_SIZE / 2,
              transform: [{ scale: centerPulse }],
            },
          ]}
        >
          {userAvatarUri ? (
            <Image source={{ uri: userAvatarUri }} style={styles.avatar} />
          ) : (
            <LinearGradient
              colors={[AppColors.primaryMuted, AppColors.primaryDark]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.userFallback}
            >
              <Text style={styles.userFallbackText}>
                {(userDisplayName || '?').trim().slice(0, 1).toUpperCase() || '?'}
              </Text>
            </LinearGradient>
          )}
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    alignItems: 'center',
    marginTop: 4,
    justifyContent: 'center',
  },
  outerEmbedded: { marginTop: 0 },
  disk: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: 'rgba(156,107,63,0.18)',
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.18,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  sweepWrap: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  wedge: { position: 'absolute' },
  needle: {
    position: 'absolute',
    width: 2,
    borderRadius: 1,
  },
  marker: {
    position: 'absolute',
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    backgroundColor: AppColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.14,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 5,
  },
  markerActive: {
    borderColor: AppColors.accent,
    borderWidth: 2,
    shadowColor: AppColors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 14,
  },
  markerAssigned: {
    borderColor: AppColors.primary,
    borderWidth: 2,
  },
  userMarker: {
    zIndex: 10,
    borderColor: AppColors.primary,
    borderWidth: 2.5,
    shadowColor: AppColors.primary,
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 10,
  },
  avatar: {
    width: MARKER_SIZE - 8,
    height: MARKER_SIZE - 8,
    borderRadius: (MARKER_SIZE - 8) / 2,
    backgroundColor: AppColors.primarySoft2,
  },
  avatarFallback: {
    width: MARKER_SIZE - 8,
    height: MARKER_SIZE - 8,
    borderRadius: (MARKER_SIZE - 8) / 2,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarFallbackText: {
    color: AppColors.primaryDark,
    fontSize: 18,
    fontWeight: '900',
  },
  userFallback: {
    width: MARKER_SIZE - 8,
    height: MARKER_SIZE - 8,
    borderRadius: (MARKER_SIZE - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userFallbackText: {
    color: AppColors.white,
    fontSize: 19,
    fontWeight: '900',
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 3,
    width: 13,
    height: 13,
    borderRadius: 7,
    backgroundColor: AppColors.accent,
    borderWidth: 2,
    borderColor: AppColors.white,
  },
  onlineDotAssigned: {
    backgroundColor: AppColors.primary,
  },
  badge: {
    position: 'absolute',
    bottom: -22,
    backgroundColor: AppColors.text,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    color: AppColors.white,
    fontSize: 10,
    fontWeight: '800',
  },
});
