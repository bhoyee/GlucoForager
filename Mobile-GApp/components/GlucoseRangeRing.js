// components/GlucoseRangeRing.js
// "3 of 4 readings in range" ring for the Home "Track today" card. Segments: in range
// (teal), above/below target (amber), low/very high (red), drawn in that order.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/Colors';
import { GLUCOSE_STATUS } from '../utils/glucose';

export default function GlucoseRangeRing({ today, size = 92 }) {
  const strokeWidth = Math.max(6, Math.round(size * 0.1));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = Number(today?.readings || 0);

  const segments = total
    ? [
        { value: today.in_range || 0, color: Colors.primary },
        { value: (today.above || 0) + (today.below || 0), color: GLUCOSE_STATUS.above.color },
        { value: (today.low || 0) + (today.very_high || 0), color: GLUCOSE_STATUS.low.color },
      ].filter((s) => s.value > 0)
    : [];

  // Small gaps between segments so separate statuses read as separate.
  const gap = segments.length > 1 ? Math.min(6, circumference * 0.02) : 0;
  let offset = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke={Colors.border} strokeWidth={strokeWidth} fill="none" />
        {segments.map((seg, i) => {
          const length = Math.max(0, (seg.value / total) * circumference - gap);
          const el = (
            <Circle
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${length} ${circumference}`}
              strokeDashoffset={-offset}
              strokeLinecap={segments.length > 1 ? 'butt' : 'round'}
              rotation={-90}
              origin={`${size / 2}, ${size / 2}`}
            />
          );
          offset += (seg.value / total) * circumference;
          return el;
        })}
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        {total ? (
          <>
            <Text style={styles.big}>
              {today.in_range}
              <Text style={styles.of}> of {total}</Text>
            </Text>
            <Text style={styles.small}>in range</Text>
          </>
        ) : (
          <Text style={[styles.small, { textAlign: 'center' }]}>No{'\n'}readings</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  big: { fontSize: 19, fontWeight: '900', color: Colors.brandNavy },
  of: { fontSize: 12, fontWeight: '700', color: Colors.textLight },
  small: { fontSize: 11, color: Colors.textLight, fontWeight: '600' },
});
