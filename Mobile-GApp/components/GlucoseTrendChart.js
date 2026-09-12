// components/GlucoseTrendChart.js
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polyline, Circle, Line, Text as SvgText } from 'react-native-svg';
import { Colors } from '../constants/Colors';

const SPIKE_THRESHOLD_MGDL = 180;
const CHART_HEIGHT = 130;
const PAD_X = 10;
const PAD_TOP = 14;
const PAD_BOTTOM = 16;
const Y_MIN = 60;
const Y_MAX = 260;

// A compact, dependency-free trend line built on react-native-svg (already used by
// CarbGoalRing) - deliberately simple: recent readings plotted over time, with the
// clinically-meaningful 180 mg/dL post-meal threshold shown as a reference line,
// rather than a general-purpose charting library.
export default function GlucoseTrendChart({ readings = [] }) {
  const [chartWidth, setChartWidth] = useState(0);

  const points = [...readings]
    .filter((r) => r?.logged_at && Number.isFinite(r?.value_mg_dl))
    .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));

  const canDraw = points.length >= 2 && chartWidth > 0;

  const renderChart = () => {
    if (!canDraw) return null;

    const minTime = new Date(points[0].logged_at).getTime();
    const maxTime = new Date(points[points.length - 1].logged_at).getTime();
    const timeSpan = Math.max(maxTime - minTime, 1);
    const plotWidth = chartWidth - PAD_X * 2;
    const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

    const xFor = (t) => PAD_X + ((t - minTime) / timeSpan) * plotWidth;
    const yFor = (v) => {
      const clamped = Math.min(Y_MAX, Math.max(Y_MIN, v));
      const ratio = (clamped - Y_MIN) / (Y_MAX - Y_MIN);
      return PAD_TOP + plotHeight - ratio * plotHeight;
    };

    const svgPoints = points
      .map((p) => `${xFor(new Date(p.logged_at).getTime())},${yFor(p.value_mg_dl)}`)
      .join(' ');
    const thresholdY = yFor(SPIKE_THRESHOLD_MGDL);

    return (
      <Svg width={chartWidth} height={CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}>
        <Line
          x1={PAD_X}
          y1={thresholdY}
          x2={chartWidth - PAD_X}
          y2={thresholdY}
          stroke={Colors.warning}
          strokeWidth={1}
          strokeDasharray="4,4"
        />
        <SvgText x={chartWidth - PAD_X} y={thresholdY - 4} fontSize={9} fill={Colors.warning} textAnchor="end">
          180 mg/dL
        </SvgText>

        <Polyline
          points={svgPoints}
          fill="none"
          stroke={Colors.primary}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {points.map((p, idx) => (
          <Circle
            key={idx}
            cx={xFor(new Date(p.logged_at).getTime())}
            cy={yFor(p.value_mg_dl)}
            r={3.5}
            fill={p.is_spike ? Colors.danger : Colors.primary}
          />
        ))}
      </Svg>
    );
  };

  const average = points.length
    ? Math.round(points.reduce((sum, p) => sum + p.value_mg_dl, 0) / points.length)
    : null;
  const spikeCount = points.filter((p) => p.is_spike).length;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Track regularly</Text>
        {points.length ? <Text style={styles.subtitle}>Last {points.length} readings</Text> : null}
      </View>

      <View
        style={styles.chartSlot}
        onLayout={(e) => setChartWidth(Math.round(e.nativeEvent.layout.width))}
      >
        {points.length < 2 ? (
          <Text style={styles.emptyText}>
            Log a few more readings to see how your glucose moves over time.
          </Text>
        ) : (
          renderChart()
        )}
      </View>

      {points.length >= 2 ? (
        <View style={styles.summaryRow}>
          <Text style={styles.summaryText}>Average {average} mg/dL</Text>
          {spikeCount > 0 ? (
            <Text style={[styles.summaryText, { color: Colors.danger }]}>
              {spikeCount} spike{spikeCount === 1 ? '' : 's'} flagged
            </Text>
          ) : (
            <Text style={styles.summaryText}>No spikes flagged</Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  headerRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 15, fontWeight: '800', color: Colors.text },
  subtitle: { fontSize: 11.5, fontWeight: '700', color: Colors.textLight },
  chartSlot: { marginTop: 10, minHeight: 20, justifyContent: 'center' },
  emptyText: { fontSize: 12.5, lineHeight: 18, color: Colors.textLight, fontWeight: '600' },
  summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  summaryText: { fontSize: 11.5, fontWeight: '700', color: Colors.textLight },
});
