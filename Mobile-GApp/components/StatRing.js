// components/StatRing.js
import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/Colors';

// A plain percent-fill ring - shared by TrackRegularlyScreen and WeeklyRecapScreen
// so both screens' in-range/high/low stats read as one consistent visual system.
export default function StatRing({ percent, color, size = 64, strokeWidth = 7 }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const ratio = Math.max(0, Math.min(1, percent / 100));
  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <Circle cx={size / 2} cy={size / 2} r={radius} stroke={Colors.border} strokeWidth={strokeWidth} fill="none" />
      {ratio > 0 ? (
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - ratio)}
          fill="none"
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      ) : null}
    </Svg>
  );
}
