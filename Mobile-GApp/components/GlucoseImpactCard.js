// components/GlucoseImpactCard.js
// "Estimated glucose impact": the TYPICAL 2-hour response shape for a food (from the
// backend's services/glucose_impact.py), shown against Gentle / Moderate / Sharp bands.
// Not a personal prediction, so no mg/dL on the curve. The personal part is the user's
// own reading the last time they ate the same thing (lastTime), which is real data.
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Defs, LinearGradient as SvgGradient, Stop, Path, Rect, Line, Circle, ClipPath, G, Text as SvgText } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../constants/Colors';
import { formatGlucose, getGlucoseUnit, MGDL_PER_MMOL, statusMeta } from '../utils/glucose';

export const IMPACT_STYLE = {
  gentle: { label: 'Gentle rise', color: '#2C8632', bg: '#E3F4E4', icon: 'trending-up' },
  moderate: { label: 'Moderate rise', color: '#C47F0A', bg: '#FFF1D6', icon: 'trending-up' },
  sharp: { label: 'Sharp rise', color: '#C53030', bg: '#FDE2E2', icon: 'trending-up' },
};

const H = 160;
const PAD = { l: 8, r: 64, t: 10, b: 22 };
const TWO_HOUR = { baseline: '#2C8632', falling: '#C47F0A', raised: '#C53030' };
const Y_MAX = 1.3;
const BANDS = [
  { from: 0, to: 0.33, color: '#2C8632', label: 'Gentle' },
  { from: 0.33, to: 0.67, color: '#C47F0A', label: 'Moderate' },
  { from: 0.67, to: Y_MAX, color: '#C53030', label: 'Sharp' },
];

function buildPath(points, x, y) {
  return points.map(([t, v], i) => `${i ? 'L' : 'M'}${x(t).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
}

export function ImpactPill({ impact, small }) {
  const s = IMPACT_STYLE[impact?.impact];
  if (!s) return null;
  return (
    <View style={[styles.pill, { backgroundColor: s.bg }, small && styles.pillSmall]}>
      <Ionicons name={s.icon} size={small ? 11 : 13} color={s.color} />
      <Text style={[styles.pillText, { color: s.color }, small && { fontSize: 11 }]}>{s.label}</Text>
    </View>
  );
}

export default function GlucoseImpactCard({ impact, compare, lastTime, title = 'Estimated glucose impact', style }) {
  const [width, setWidth] = useState(0);
  const [unit, setUnit] = useState('mg/dL');
  useEffect(() => {
    getGlucoseUnit().then(setUnit).catch(() => {});
  }, []);
  if (!impact?.points?.length) return null;

  const s = IMPACT_STYLE[impact.impact] || IMPACT_STYLE.moderate;
  const plotW = Math.max(width - PAD.l - PAD.r, 1);
  const plotH = H - PAD.t - PAD.b;
  const x = (t) => PAD.l + (t / 120) * plotW;
  const y = (v) => PAD.t + plotH - (Math.min(v, Y_MAX) / Y_MAX) * plotH;
  const line = buildPath(impact.points, x, y);
  const area = `${line} L${x(120).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const peak = impact.points.reduce((a, b) => (b[1] > a[1] ? b : a), impact.points[0]);
  const compareStyle = compare?.impact ? IMPACT_STYLE[compare.impact.impact] : null;

  const lastMeta = lastTime ? statusMeta(lastTime.status) : null;
  const lastDelta =
    lastTime && ['above', 'below'].includes(lastTime.status) && lastTime.delta_mg_dl > 0
      ? ` · ${unit === 'mmol/L' ? (lastTime.delta_mg_dl / MGDL_PER_MMOL).toFixed(1) : Math.round(lastTime.delta_mg_dl)} ${lastTime.status} target`
      : lastTime?.status === 'in_range'
        ? ' · on target'
        : '';
  const hours = lastTime ? Math.round((lastTime.minutes_after / 60) * 10) / 10 : null;

  return (
    <View style={[styles.card, style]}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {impact.portion ? <Text style={styles.sub}>Typical response {impact.portion}</Text> : null}
        </View>
        <ImpactPill impact={impact} />
      </View>

      <View style={styles.stats}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Peak</Text>
          <Text style={styles.statValue}>{impact.peak_window}</Text>
        </View>
        {impact.two_hour ? (
          <View style={[styles.stat, { backgroundColor: `${TWO_HOUR[impact.two_hour.level] || '#64748B'}12` }]}>
            <Text style={styles.statLabel}>At 2 hours</Text>
            <Text style={[styles.statValue, { color: TWO_HOUR[impact.two_hour.level] || Colors.brandNavy }]}>
              {impact.two_hour.text.replace(/ (by|at) 2 hours$/, '')}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={{ height: H }} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
        {width > 0 ? (
          <Svg width={width} height={H}>
            <Defs>
              <SvgGradient id="impactFill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={s.color} stopOpacity="0.28" />
                <Stop offset="1" stopColor={s.color} stopOpacity="0.02" />
              </SvgGradient>
              {BANDS.map((b) => (
                <ClipPath key={b.label} id={`band-${b.label}`}>
                  <Rect x={0} y={y(b.to)} width={width} height={y(b.from) - y(b.to) + (b.from === 0 ? 4 : 0.5)} />
                </ClipPath>
              ))}
            </Defs>
            {BANDS.map((b) => (
              <React.Fragment key={b.label}>
                <Rect x={PAD.l} y={y(b.to)} width={plotW} height={y(b.from) - y(b.to)} fill={b.color} opacity={0.06} />
                <SvgText x={width - PAD.r + 8} y={(y(b.from) + y(b.to)) / 2 + 4} fontSize="10.5" fontWeight="800" fill={b.color}>
                  {b.label}
                </SvgText>
              </React.Fragment>
            ))}
            {[0, 30, 60, 90, 120].map((t) => (
              <React.Fragment key={t}>
                <Line x1={x(t)} y1={PAD.t} x2={x(t)} y2={y(0)} stroke="#E9EDE5" strokeWidth={1} strokeDasharray="3,4" />
                <SvgText x={x(t)} y={H - 6} fontSize="10" fill={Colors.textMuted} textAnchor={t === 0 ? 'start' : t === 120 ? 'end' : 'middle'}>
                  {t === 0 ? 'Eat' : t === 120 ? '2h check' : `${t}m`}
                </SvgText>
              </React.Fragment>
            ))}
            <Line x1={PAD.l} y1={y(0)} x2={PAD.l + plotW} y2={y(0)} stroke="#CBD5C5" strokeWidth={1} />
            {compare?.impact?.points?.length ? (
              <Path d={buildPath(compare.impact.points, x, y)} fill="none" stroke="#94A3B8" strokeWidth={2} strokeDasharray="5,4" />
            ) : null}
            <Path d={area} fill="url(#impactFill)" />
            {/* The line takes the colour of each band it passes through: green, amber, red. */}
            {BANDS.map((b) => (
              <G key={b.label} clipPath={`url(#band-${b.label})`}>
                <Path d={line} fill="none" stroke={b.color} strokeWidth={3.2} strokeLinejoin="round" strokeLinecap="round" />
              </G>
            ))}
            <Circle cx={x(peak[0])} cy={y(peak[1])} r={5} fill="white" stroke={s.color} strokeWidth={2.5} />
            {/* The 2-hour check: when people test after a meal. */}
            <Line x1={x(120)} y1={PAD.t} x2={x(120)} y2={y(0)} stroke={Colors.primary} strokeWidth={1.5} strokeDasharray="4,3" />
            <Circle cx={x(120)} cy={y(impact.points[impact.points.length - 1][1])} r={4.5} fill={Colors.primary} stroke="white" strokeWidth={2} />
          </Svg>
        ) : null}
      </View>

      {compare?.impact ? (
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, { backgroundColor: s.color }]} />
            <Text style={styles.legendText} numberOfLines={1}>{compare.mainLabel || 'This option'}</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendLine, styles.legendDashed]} />
            <Text style={styles.legendText} numberOfLines={1}>
              {compare.label}
              {compareStyle ? ` (${compareStyle.label.toLowerCase()})` : ''}
            </Text>
          </View>
        </View>
      ) : null}

      {impact.factors?.length ? (
        <View style={styles.factors}>
          {impact.factors.map((f) => (
            <View key={f} style={styles.factor}>
              <Ionicons name="ellipse" size={6} color={s.color} />
              <Text style={styles.factorText}>{f}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {lastTime ? (
        <View style={[styles.last, { backgroundColor: `${lastMeta.color}12`, borderColor: `${lastMeta.color}33` }]}>
          <Ionicons name="person-circle" size={20} color={lastMeta.color} />
          <Text style={styles.lastText}>
            <Text style={styles.lastStrong}>Your reading last time: </Text>
            {formatGlucose(lastTime.value_mg_dl, unit)}, {hours}h after
            <Text style={{ color: lastMeta.color, fontWeight: '900' }}>{lastDelta}</Text>
          </Text>
        </View>
      ) : null}

      <Text style={styles.note}>
        Typical response for this food, not a prediction for you. Everyone responds differently, so check with a reading.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF0EA',
    shadowColor: '#0F2A3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  title: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  sub: { fontSize: 12.5, color: Colors.textLight, marginTop: 2 },
  stats: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  stat: { flex: 1, backgroundColor: '#F4F6F2', borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10 },
  statLabel: { fontSize: 11, fontWeight: '800', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.4 },
  statValue: { fontSize: 14, fontWeight: '900', color: Colors.brandNavy, marginTop: 2 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pillSmall: { paddingHorizontal: 8, paddingVertical: 3 },
  pillText: { fontSize: 12, fontWeight: '900' },
  legend: { flexDirection: 'row', gap: 14, marginTop: 6, flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  legendLine: { width: 18, height: 3, borderRadius: 2 },
  legendDashed: { backgroundColor: '#94A3B8', opacity: 0.8 },
  legendText: { fontSize: 12, fontWeight: '700', color: Colors.textLight, flexShrink: 1 },
  factors: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  factor: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#F4F6F2', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  factorText: { fontSize: 12, fontWeight: '700', color: Colors.brandNavy },
  last: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 12, borderWidth: 1 },
  lastText: { flex: 1, fontSize: 13, color: Colors.brandNavy, lineHeight: 18 },
  lastStrong: { fontWeight: '900' },
  note: { fontSize: 11, color: Colors.textMuted, marginTop: 10, lineHeight: 15 },
});
