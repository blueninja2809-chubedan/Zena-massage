import React from 'react';
import Svg, { Path, Text as SvgText } from 'react-native-svg';

interface ZaloIconProps {
  size?: number;
}

export default function ZaloIcon({ size = 32 }: ZaloIconProps) {
  const scale = size / 100;
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {/* Crescent / speech bubble shape */}
      <Path
        d="M25 8 C10 20, 5 45, 15 68 C20 78, 22 84, 18 92 C28 86, 35 82, 42 80 C55 86, 72 84, 82 74 C95 60, 95 35, 80 18 C68 5, 45 0, 25 8 Z"
        fill="#0068FF"
      />
      {/* "Zalo" text */}
      <SvgText
        x="50"
        y="56"
        textAnchor="middle"
        fontWeight="bold"
        fontSize={30 }
        fill="#FFFFFF"
      >
        Zalo
      </SvgText>
    </Svg>
  );
}
