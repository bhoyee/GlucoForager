// screens/main/TrackRegularlyScreen.js
// "Glucose trends": glucose over 7/30/90 days. Every reading is judged by the backend
// against the user's own targets (services/glucose_targets.py), so "on target" here
// means exactly what it means on Home and in the meal diary.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Polyline, Rect, Line, Text as SvgText } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';
import StatRing from '../../components/StatRing';
import { parseServerDate } from '../../utils/dateUtils';
import {
  CONTEXT_LABELS,
  MGDL_PER_MMOL,
  formatGlucose,
  getGlucoseUnit,
  setGlucoseUnit,
  statusMeta,
  toUnitValue,
} from '../../utils/glucose';

const RANGE_OPTIONS = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
];
const UNITS = ['mg/dL', 'mmol/L'];
const AMBER = '#B7791F';
const RED = '#C53030';

// Same fixed safety bands as the backend; the upper edge of the chart band is the
// user's after-meal target (the widest "on target" range across the day).
const LOW_MGDL = 70;
const VERY_HIGH_MGDL = 250;

const num = (mgDl, unit) => String(toUnitValue(mgDl, unit));

function verdict(reading, unit) {
  if (reading.status === 'in_range') return 'On target';
  if (reading.status === 'low') return 'Low';
  if (reading.status === 'very_high') return 'Very high';
  const delta = Number(reading.delta_mg_dl) || 0;
  const amount = unit === 'mmol/L' ? (delta / MGDL_PER_MMOL).toFixed(1) : `${Math.round(delta)}`;
  return `${amount} ${reading.status} target`;
}

function formatRelativeDateTime(value) {
  const date = parseServerDate(value);
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (date.toDateString() === now.toDateString()) return `Today, ${time}`;
  if (date.toDateString() === yesterday.toDateString()) return `Yesterday, ${time}`;
  return `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)}, ${time}`;
}

const CHART_HEIGHT = 200;
const CHART_Y_MAX = 300;
const PAD_X = 6;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

function GlucoseTrendCard({ dayPoints, average, rangeLabel, unit, windowStartMs, windowEndMs, days, bandHigh }) {
  const [chartWidth, setChartWidth] = useState(0);
  const plotWidth = Math.max(chartWidth - PAD_X * 2, 1);
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const yFor = (v) => PAD_TOP + plotHeight - (Math.min(v, CHART_Y_MAX) / CHART_Y_MAX) * plotHeight;
  // Positioned by real time within the selected window, so 7/30/90 days look different.
  const windowSpan = Math.max(windowEndMs - windowStartMs, 1);
  const xFor = (ms) => PAD_X + Math.min(1, Math.max(0, (ms - windowStartMs) / windowSpan)) * plotWidth;

  const dotColor = (v) => (v < LOW_MGDL || v >= VERY_HIGH_MGDL ? RED : v >= bandHigh ? AMBER : Colors.success);
  const bandTop = yFor(bandHigh);
  const bandBottom = yFor(LOW_MGDL);
  const svgPoints = dayPoints.map((p) => `${xFor(p.dateMs)},${yFor(p.value)}`).join(' ');
  // One plain string: react-native-svg's <Text> drops interleaved children.
  const targetLabel = `Target ${num(LOW_MGDL, unit)}–${num(bandHigh, unit)} ${unit}`;
  const gridValues = [300, bandHigh, LOW_MGDL, 0];

  const tickCount = days <= 7 ? days : 6;
  const ticks = Array.from({ length: tickCount }, (_, i) => {
    const ms = windowStartMs + (tickCount === 1 ? 0 : i / (tickCount - 1)) * windowSpan;
    return { ms, label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(ms)) };
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View>
          <Text style={styles.cardTitle}>Daily average</Text>
          <Text style={styles.cardSubtitle}>{rangeLabel}</Text>
        </View>
        {average != null ? (
          <View style={styles.averageBadge}>
            <Text style={styles.averageValue}>{num(average, unit)}</Text>
            <Text style={styles.averageLabel}>Average{'\n'}{unit}</Text>
          </View>
        ) : null}
      </View>

      {dayPoints.length === 0 ? (
        <Text style={styles.emptyText}>No readings logged in this period yet.</Text>
      ) : (
        <>
          <View style={styles.yAxisRow}>
            <View style={styles.yAxisLabels}>
              {gridValues.map((y) => (
                <Text key={y} style={styles.yAxisLabel}>{num(y, unit)}</Text>
              ))}
            </View>
            <View style={styles.chartArea} onLayout={(e) => setChartWidth(Math.round(e.nativeEvent.layout.width))}>
              {chartWidth > 0 ? (
                <Svg width={chartWidth} height={CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}>
                  <Rect x={0} y={bandTop} width={chartWidth} height={Math.max(bandBottom - bandTop, 0)} fill={`${Colors.success}1A`} />
                  {gridValues.map((y) => (
                    <Line key={`h-${y}`} x1={0} y1={yFor(y)} x2={chartWidth} y2={yFor(y)} stroke="#EEF0EA" strokeWidth={1} />
                  ))}
                  {ticks.map((t, i) => (
                    <Line
                      key={`v-${i}`}
                      x1={xFor(t.ms)}
                      y1={PAD_TOP}
                      x2={xFor(t.ms)}
                      y2={CHART_HEIGHT - PAD_BOTTOM}
                      stroke="#EEF0EA"
                      strokeWidth={1}
                      strokeDasharray="3,4"
                    />
                  ))}
                  {dayPoints.length > 1 ? (
                    <Polyline points={svgPoints} fill="none" stroke={Colors.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  ) : null}
                  {dayPoints.map((p) => (
                    <Circle key={p.dateKey} cx={xFor(p.dateMs)} cy={yFor(p.value)} r={5} fill={dotColor(p.value)} stroke="white" strokeWidth={1.5} />
                  ))}
                  <SvgText
                    x={chartWidth - 4}
                    y={Math.max(bandTop + 12, PAD_TOP + 10)}
                    fontSize={9.5}
                    fontWeight="700"
                    fill={Colors.success}
                    textAnchor="end"
                  >
                    {targetLabel}
                  </SvgText>
                </Svg>
              ) : null}
            </View>
          </View>
          <View style={styles.xAxisRow}>
            {ticks.map((t, i) => (
              <Text key={i} style={styles.xAxisLabel}>{t.label}</Text>
            ))}
          </View>
        </>
      )}
    </View>
  );
}

export default function TrackRegularlyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const [days, setDays] = useState(7);
  const [readings, setReadings] = useState([]);
  const [targets, setTargets] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [unit, setUnit] = useState('mg/dL');

  const switchUnit = (nextUnit) => {
    setUnit(nextUnit);
    setGlucoseUnit(nextUnit);
  };

  const load = useCallback(async (selectedDays) => {
    setIsLoading(true);
    try {
      setUnit(await getGlucoseUnit());
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setReadings([]);
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/glucose?days=${selectedDays}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 12000 }
      );
      const data = response.ok ? await response.json() : null;
      setReadings(data?.items || []);
      setTargets(data?.targets || null);
    } catch {
      setReadings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Refetch on every focus, so a reading logged elsewhere shows on return.
  useFocusEffect(
    useCallback(() => {
      load(days);
    }, [days, load])
  );

  const sorted = [...readings].sort((a, b) => parseServerDate(a.logged_at) - parseServerDate(b.logged_at));

  // One point per calendar day (the day's average) keeps 30/90 days readable.
  const byDay = new Map();
  sorted.forEach((r) => {
    const d = parseServerDate(r.logged_at);
    const dateKey = d.toDateString();
    if (!byDay.has(dateKey)) byDay.set(dateKey, { total: 0, count: 0, date: d });
    const bucket = byDay.get(dateKey);
    bucket.total += r.value_mg_dl;
    bucket.count += 1;
  });
  const dayPoints = Array.from(byDay.entries()).map(([dateKey, b]) => ({
    dateKey,
    dateMs: b.date.getTime(),
    value: Math.round(b.total / b.count),
  }));

  // The window is exactly what was picked, not just the span that has data.
  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  windowStart.setHours(0, 0, 0, 0);
  const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const rangeLabel = `${dateFormatter.format(windowStart)} – ${dateFormatter.format(now)}`;

  const average = readings.length
    ? Math.round(readings.reduce((sum, r) => sum + r.value_mg_dl, 0) / readings.length)
    : null;

  const onTarget = readings.filter((r) => r.status === 'in_range').length;
  const above = readings.filter((r) => r.status === 'above' || r.status === 'very_high').length;
  const below = readings.filter((r) => r.status === 'below' || r.status === 'low').length;
  const lows = readings.filter((r) => r.status === 'low').length;
  const veryHighs = readings.filter((r) => r.status === 'very_high').length;
  const total = readings.length || 1;
  const pct = (n) => Math.round((n / total) * 100);

  const bandHigh = targets?.postmeal_high || 180;
  const recentReadings = [...sorted].reverse().slice(0, 5);
  const openAllReadings = () => navigation.navigate('FoodLog', { initialFilter: 'glucose' });

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}>
        <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
          <View style={styles.headerRow}>
            <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={styles.headerTitle}>Glucose trends</Text>
              <Text style={styles.headerSubtitle}>How your readings compare with your targets</Text>
            </View>
          </View>

          <View style={styles.controls}>
            <View style={[styles.segment, { flex: 1 }]}>
              {RANGE_OPTIONS.map((opt) => {
                const active = days === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.segmentItem, active && styles.segmentItemActive]}
                    onPress={() => setDays(opt.key)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.segment}>
              {UNITS.map((u) => {
                const active = unit === u;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitItem, active && styles.segmentItemActive]}
                    onPress={() => switchUnit(u)}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.unitText, active && styles.segmentTextActive]}>{u}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {isLoading && !readings.length ? (
            <ActivityIndicator style={{ paddingVertical: 60 }} size="large" color={Colors.primary} />
          ) : readings.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="trending-up" size={28} color={Colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>No readings in the last {days} days</Text>
              <Text style={styles.emptyBody}>Log your glucose and your trends will build up here.</Text>
              <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('LogGlucose')} activeOpacity={0.88}>
                <Ionicons name="water" size={16} color="white" />
                <Text style={styles.primaryBtnText}>Log glucose</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <View style={styles.statsCard}>
                <Text style={styles.statsTitle}>
                  {onTarget} of {readings.length} reading{readings.length === 1 ? '' : 's'} on target
                </Text>
                <View style={styles.statsRow}>
                  {[
                    { label: 'On target', n: onTarget, color: Colors.success },
                    { label: 'Above target', n: above, color: AMBER },
                    { label: 'Below target', n: below, color: RED },
                  ].map((s, i) => (
                    <React.Fragment key={s.label}>
                      {i ? <View style={styles.statDivider} /> : null}
                      <View style={styles.statColumn}>
                        <StatRing percent={pct(s.n)} color={s.color} />
                        <Text style={styles.statPercent}>{pct(s.n)}%</Text>
                        <Text style={styles.statLabel}>{s.label}</Text>
                        <Text style={styles.statSublabel}>{s.n} reading{s.n === 1 ? '' : 's'}</Text>
                      </View>
                    </React.Fragment>
                  ))}
                </View>
                {lows || veryHighs ? (
                  <View style={styles.alertRow}>
                    <Ionicons name="alert-circle" size={15} color={RED} />
                    <Text style={styles.alertText}>
                      {[lows ? `${lows} low` : null, veryHighs ? `${veryHighs} very high` : null].filter(Boolean).join(' · ')}
                      {' '}in this period. If this keeps happening, talk to your healthcare team.
                    </Text>
                  </View>
                ) : null}
              </View>

              <GlucoseTrendCard
                dayPoints={dayPoints}
                average={average}
                rangeLabel={rangeLabel}
                unit={unit}
                windowStartMs={windowStart.getTime()}
                windowEndMs={now.getTime()}
                days={days}
                bandHigh={bandHigh}
              />

              {targets ? (
                <TouchableOpacity style={styles.targetsCard} onPress={() => navigation.navigate('GlucoseTargets')} activeOpacity={0.85}>
                  <Ionicons name="flag-outline" size={18} color={Colors.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.targetsTitle}>{targets.is_default ? 'Standard targets' : 'Your targets'}</Text>
                    <Text style={styles.targetsText}>
                      Before meals {num(targets.premeal_low, unit)}–{num(targets.premeal_high, unit)} · after meals under{' '}
                      {formatGlucose(targets.postmeal_high, unit)}
                    </Text>
                  </View>
                  <Text style={styles.link}>Edit</Text>
                </TouchableOpacity>
              ) : null}

              <View style={styles.card}>
                <View style={styles.cardHeaderRow}>
                  <Text style={styles.cardTitle}>Recent readings</Text>
                  <TouchableOpacity onPress={openAllReadings} hitSlop={8}>
                    <Text style={styles.link}>See all ›</Text>
                  </TouchableOpacity>
                </View>
                {recentReadings.map((r, idx) => {
                  const meta = statusMeta(r.status);
                  return (
                    <TouchableOpacity
                      key={r.id}
                      style={[styles.recentRow, idx === recentReadings.length - 1 && { borderBottomWidth: 0 }]}
                      onPress={openAllReadings}
                      activeOpacity={0.75}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recentValue}>{formatGlucose(r.value_mg_dl, unit)}</Text>
                        <Text style={styles.recentTime} numberOfLines={1}>
                          {formatRelativeDateTime(r.logged_at)}
                          {r.context ? ` · ${CONTEXT_LABELS[r.context] || r.context}` : ''}
                        </Text>
                      </View>
                      <View style={[styles.pill, { backgroundColor: `${meta.color}1A` }]}>
                        <Text style={[styles.pillText, { color: meta.color }]}>{verdict(r, unit)}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <TouchableOpacity style={styles.primaryBtnWide} onPress={() => navigation.navigate('LogGlucose')} activeOpacity={0.88}>
                <Ionicons name="add" size={18} color="white" />
                <Text style={styles.primaryBtnText}>Log a reading</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { backgroundColor: Colors.primaryDark, paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '700' },
  controls: { flexDirection: 'row', gap: 8, marginTop: 14 },
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4 },
  segmentItem: { flex: 1, height: 34, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  unitItem: { height: 34, paddingHorizontal: 9, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: 'white' },
  segmentText: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  unitText: { fontSize: 11.5, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  segmentTextActive: { color: Colors.primaryDark },
  content: { padding: 16, gap: 12 },
  card: { padding: 16, borderRadius: 18, backgroundColor: 'white', borderWidth: 1, borderColor: '#E9ECE4' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  cardSubtitle: { marginTop: 3, fontSize: 12.5, fontWeight: '600', color: Colors.textLight },
  averageBadge: { alignItems: 'center', backgroundColor: '#E8F4F3', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  averageValue: { fontSize: 20, fontWeight: '900', color: Colors.brandNavy },
  averageLabel: { fontSize: 10, fontWeight: '700', color: Colors.textLight, textAlign: 'center' },
  emptyText: { marginTop: 12, fontSize: 13, color: Colors.textLight },
  yAxisRow: { flexDirection: 'row', marginTop: 14 },
  yAxisLabels: { justifyContent: 'space-between', paddingBottom: 26, paddingTop: 16, height: CHART_HEIGHT },
  yAxisLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, width: 34 },
  chartArea: { flex: 1, height: CHART_HEIGHT },
  xAxisRow: { flexDirection: 'row', marginLeft: 34 },
  xAxisLabel: { flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: Colors.textMuted },
  statsCard: { padding: 16, borderRadius: 18, backgroundColor: 'white', borderWidth: 1, borderColor: '#E9ECE4' },
  statsTitle: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy, marginBottom: 14 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statColumn: { flex: 1, alignItems: 'center', gap: 5 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#EEF0EA', marginHorizontal: 4 },
  statPercent: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  statLabel: { fontSize: 12, fontWeight: '800', color: Colors.brandNavy },
  statSublabel: { fontSize: 10.5, color: Colors.textMuted },
  alertRow: { flexDirection: 'row', gap: 8, marginTop: 14, padding: 10, borderRadius: 12, backgroundColor: '#FFF5F5' },
  alertText: { flex: 1, fontSize: 12.5, color: '#9B2C2C', lineHeight: 17 },
  targetsCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#E8F4F3' },
  targetsTitle: { fontSize: 13.5, fontWeight: '900', color: Colors.brandNavy },
  targetsText: { fontSize: 12, color: Colors.brandNavy, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '900', color: Colors.primary },
  recentRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2EC' },
  recentValue: { fontSize: 14.5, fontWeight: '800', color: Colors.brandNavy },
  recentTime: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 12 },
  emptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E8F4F3', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 17, fontWeight: '900', color: Colors.brandNavy, marginTop: 14, textAlign: 'center' },
  emptyBody: { fontSize: 13.5, color: Colors.textLight, marginTop: 6, textAlign: 'center' },
  primaryBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 18, height: 46, marginTop: 18 },
  primaryBtnWide: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 14, height: 50 },
  primaryBtnText: { color: 'white', fontWeight: '900', fontSize: 15 },
});
