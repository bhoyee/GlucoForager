// components/CarbGoalRing.js
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/Colors';

const DEFAULT_SIZE = 56;
const STROKE_WIDTH_RATIO = 6 / 56;

// mode "ceiling": normal target, red once carbsLogged exceeds carbGoal (Type 2 /
//   prediabetes / general use).
// mode "floor": carbGoal is a minimum, not a max, so the color logic flips - red while
//   short of it, green once reached (gestational diabetes guidance).
// mode "none": no meaningful daily target exists (Type 1 is per-meal carb counting
//   against insulin, not a day total), so no arc/verdict is drawn at all.
export function getCarbGoalRingColor(carbsLogged, carbGoal, mode = 'ceiling') {
  if (mode === 'none' || carbsLogged == null || !carbGoal) return Colors.textLight;
  const ratio = carbsLogged / carbGoal;
  if (mode === 'floor') {
    if (ratio >= 1) return Colors.success;
    if (ratio >= 0.85) return Colors.warning;
    return Colors.danger;
  }
  if (ratio > 1) return Colors.danger;
  if (ratio >= 0.85) return Colors.warning;
  return Colors.success;
}

export default function CarbGoalRing({ carbsLogged, carbGoal, mode = 'ceiling', size = DEFAULT_SIZE }) {
  const strokeWidth = Math.max(4, Math.round(size * STROKE_WIDTH_RATIO));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const showArc = mode !== 'none' && carbsLogged != null && carbGoal;
  const ratio = showArc ? Math.min(carbsLogged / carbGoal, 1) : 0;
  const color = getCarbGoalRingColor(carbsLogged, carbGoal, mode);
  const dashOffset = circumference * (1 - ratio);
  // Real (uncapped) percentage - e.g. can read "385%" if well over a ceiling, or
  // "128%" past a floor. Kept modest in size ("not too big") relative to the ring.
  const percentLabel = showArc ? Math.round((carbsLogged / carbGoal) * 100) : null;
  const fontSize = Math.min(20, Math.max(10, Math.round(size * 0.2)));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={Colors.border}
          strokeWidth={strokeWidth}
          fill="none"
        />
        {showArc && ratio > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            strokeDashoffset={dashOffset}
            fill="none"
            rotation={-90}
            origin={`${size / 2}, ${size / 2}`}
          />
        ) : null}
      </Svg>
      {percentLabel != null ? (
        <View style={StyleSheet.absoluteFillObject} pointerEvents="none">
          <View style={styles.labelCenter}>
            <Text style={[styles.labelText, { fontSize, color }]} numberOfLines={1} adjustsFontSizeToFit>
              {percentLabel}%
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  labelCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  labelText: { fontWeight: '800' },
});
