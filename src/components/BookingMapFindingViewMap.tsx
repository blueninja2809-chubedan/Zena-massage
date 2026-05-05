/**
 * Props + marker UI dùng chung cho màn quét KTV (Mapbox — `BookingMapFindingViewMapbox`).
 */
import { AppColors } from '@/constants/appColors';
import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import type { BookingRadarMarker } from './BookingRadarFindingView';

type LatLng = { latitude: number; longitude: number };

const MARKER_SIZE = 52;

export type BookingMapFindingViewMapProps = {
  userCenter: LatLng;
  markers: BookingRadarMarker[];
  selectedId: string | null;
  onSelectTech: (id: string) => void;
  topInset: number;
  cityLabel: string;
  onBack: () => void;
  onCancel: () => void;
  cancelLabel: string;
  mainTitle: string;
  subTitle: string;
  statusPillText: string;
  headerVariant?: 'default' | 'compact';
  userAvatarUri?: string | null;
  userDisplayName?: string;
  /** Mapbox `UserLocation` → GPS native; đồng bộ lại radar/parent khi có fix mới (xem tài liệu UserLocation `onUpdate`). */
  onNativeGpsLocation?: (coords: LatLng) => void;
};

export function getDistanceKm(from: LatLng, to: LatLng): number {
  const R = 6371;
  const toRad = (v: number) => (v * Math.PI) / 180;
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

export function TechMarkerBubble({
  tech,
  selected,
  userCenter,
  showDistanceAlways = false,
}: {
  tech: BookingRadarMarker;
  selected: boolean;
  userCenter: LatLng;
  /** Hiện km dưới mỗi ghim (mặc định chỉ khi chọn) */
  showDistanceAlways?: boolean;
}) {
  const d = getDistanceKm(userCenter, { latitude: tech.latitude, longitude: tech.longitude });
  const showDist = selected || showDistanceAlways;
  return (
    <View style={mStyles.wrap}>
      <View
        style={[
          mStyles.bubble,
          selected && mStyles.bubbleSelected,
          tech.isAssigned && !selected && mStyles.bubbleAssigned,
        ]}
      >
        {tech.avatar ? (
          <Image source={{ uri: tech.avatar }} style={mStyles.avatar} />
        ) : (
          <View style={mStyles.fallback}>
            <Text style={mStyles.fallbackText}>{tech.name.trim().slice(0, 1).toUpperCase()}</Text>
          </View>
        )}
        <View style={mStyles.onlineDot} />
      </View>
      {showDist ? (
        <View style={[mStyles.distPill, !selected && showDistanceAlways && mStyles.distPillMuted]}>
          <Text style={mStyles.distText}>{d.toFixed(1)} km</Text>
        </View>
      ) : null}
    </View>
  );
}

const mStyles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  bubble: {
    width: MARKER_SIZE,
    height: MARKER_SIZE,
    borderRadius: MARKER_SIZE / 2,
    backgroundColor: AppColors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: AppColors.border,
    shadowColor: AppColors.primaryDark,
    shadowOpacity: 0.2,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
  bubbleSelected: {
    borderWidth: 3,
    borderColor: AppColors.accent,
    shadowColor: AppColors.accent,
    shadowOpacity: 0.35,
  },
  bubbleAssigned: {
    borderWidth: 3,
    borderColor: AppColors.primary,
  },
  avatar: {
    width: MARKER_SIZE - 8,
    height: MARKER_SIZE - 8,
    borderRadius: (MARKER_SIZE - 8) / 2,
    backgroundColor: AppColors.primarySoft2,
  },
  fallback: {
    width: MARKER_SIZE - 8,
    height: MARKER_SIZE - 8,
    borderRadius: (MARKER_SIZE - 8) / 2,
    backgroundColor: AppColors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackText: {
    color: AppColors.primaryDark,
    fontSize: 20,
    fontWeight: '900',
  },
  onlineDot: {
    position: 'absolute',
    right: 2,
    bottom: 3,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: AppColors.accent,
    borderWidth: 2,
    borderColor: AppColors.white,
  },
  distPill: {
    marginTop: 6,
    backgroundColor: AppColors.text,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  distPillMuted: {
    backgroundColor: 'rgba(45, 52, 54, 0.78)',
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  distText: { color: AppColors.white, fontSize: 10, fontWeight: '800' },
});

export function UserMarkerBubble({ uri, name }: { uri?: string | null; name: string }) {
  const initial = (name || '?').trim().slice(0, 1).toUpperCase() || '?';
  return (
    <View style={[mStyles.bubble, { borderWidth: 2.5, borderColor: AppColors.accent }]}>
      {uri ? (
        <Image source={{ uri }} style={mStyles.avatar} />
      ) : (
        <View style={mStyles.fallback}>
          <Text style={mStyles.fallbackText}>{initial}</Text>
        </View>
      )}
    </View>
  );
}
