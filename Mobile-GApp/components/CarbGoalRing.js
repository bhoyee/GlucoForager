// components/CarbGoalRing.js
import React from 'react';
import Svg, { Circle } from 'react-native-svg';
import { Colors } from '../constants/Colors';

const SIZE = 56;
const STROKE_WIDTH = 6;
const RADIUS = (SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function getCarbGoalRingColor(carbsLogged, carbGoal) {
  if (carbsLogged == null || !carbGoal) return Colors.border;
  const ratio = carbsLogged / carbGoal;
  if (ratio > 1) return Colors.danger;
  if (ratio >= 0.85) return Colors.warning;
  return Colors.success;
}

export default function CarbGoalRing({ carbsLogged, carbGoal }) {
  const ratio = carbsLogged != null && carbGoal ? Math.min(carbsLogged / carbGoal, 1) : 0;
  const color = getCarbGoalRingColor(carbsLogged, carbGoal);
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
      {ratio > 0 ? (
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
