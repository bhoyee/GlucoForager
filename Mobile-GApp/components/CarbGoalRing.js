// components/CarbGoalRing.js
import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/Colors';

const SIZE = 56;
const STROKE_WIDTH = 6;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

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

export default function CarbGoalRing({ carbsLogged, carbGoal, mode = 'ceiling' }) {
  const showArc = mode !== 'none' && carbsLogged != null && carbGoal;
  const ratio = showArc ? Math.min(carbsLogged / carbGoal, 1) : 0;
  const color = getCarbGoalRingColor(carbsLogged, carbGoal, mode);
  const dashOffset = CIRCUMFERENCE * (1 - ratio);

  return (
    <Svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
      <Circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        stroke={Colors.border}
        strokeWidth={STROKE_WIDTH}
        fill="none"
      />
      {showArc && ratio > 0 ? (
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={color}
          strokeWidth={STROKE_WIDTH}
          strokeLinecap="round"
          strokeDasharray={`${CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          strokeDashoffset={dashOffset}
          fill="none"
          rotation={-90}
          origin={`${SIZE / 2}, ${SIZE / 2}`}
        />
      ) : null}
    </Svg>
  );
}
