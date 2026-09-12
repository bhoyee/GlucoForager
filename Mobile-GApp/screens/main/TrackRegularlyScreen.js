import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Circle, Polyline, Rect } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';

const RANGE_OPTIONS = [
  { key: 7, label: '7 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
];

const TARGET_LOW = 70;
const TARGET_HIGH = 180;
const SEVERE_HIGH = 220;

// Simple 3-tier bucketing purely for this trends view (not the same thing as the
// backend's is_spike/general_alert, which are about meal-linkage and urgent-only
// bands) - this is a plain "where does this value sit vs. the standard 70-180
// target range" view, matching how most glucose trend charts are read at a glance.
function bucketFor(value) {
  if (value < TARGET_LOW || value >= SEVERE_HIGH) return 'severe';
  if (value > TARGET_HIGH) return 'high';
  return 'inRange';
}

const BUCKET_COLOR = { inRange: Colors.success, high: '#D97706', severe: Colors.danger };
const BUCKET_LABEL = { inRange: 'In range', high: 'High', severe: 'High' };

function formatRelativeDateTime(value) {
  const date = new Date(value);
  const now = new Date();
  const time = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(date);
  const isSameDay = date.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = date.toDateString() === yesterday.toDateString();
  if (isSameDay) return `Today, ${time}`;
  if (isYesterday) return `Yesterday, ${time}`;
  return `${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date)}, ${time}`;
}

function Ring({ percent, color, size = 64 }) {
  const strokeWidth = 7;
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

const CHART_HEIGHT = 200;
const CHART_Y_MAX = 300;
const PAD_X = 6;
const PAD_TOP = 16;
const PAD_BOTTOM = 26;

function GlucoseTrendCard({ dayPoints, average, rangeLabel }) {
  const [chartWidth, setChartWidth] = useState(0);
  const plotWidth = Math.max(chartWidth - PAD_X * 2, 1);
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

  const yFor = (v) => PAD_TOP + plotHeight - (Math.min(v, CHART_Y_MAX) / CHART_Y_MAX) * plotHeight;
  const xFor = (i) => (dayPoints.length <= 1 ? PAD_X : PAD_X + (i / (dayPoints.length - 1)) * plotWidth);

  const bandTop = yFor(TARGET_HIGH);
  const bandBottom = yFor(TARGET_LOW);
  const svgPoints = dayPoints.map((p, i) => `${xFor(i)},${yFor(p.value)}`).join(' ');

  // Thin out x-axis day labels so 30/90-day views don't overlap.
  const labelEvery = dayPoints.length <= 8 ? 1 : Math.ceil(dayPoints.length / 6);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View>
          <Text style={styles.cardTitle}>Glucose trend</Text>
          <Text style={styles.cardSubtitle}>{rangeLabel}</Text>
        </View>
        {average != null ? (
          <View style={styles.averageBadge}>
            <Text style={styles.averageValue}>{average}</Text>
            <Text style={styles.averageLabel}>Average{'\n'}mg/dL</Text>
          </View>
        ) : null}
      </View>

      {dayPoints.length === 0 ? (
        <Text style={styles.emptyText}>No readings logged in this period yet.</Text>
      ) : (
        <>
          <View style={styles.yAxisRow}>
            <View style={styles.yAxisLabels}>
              {[300, 180, 70, 0].map((y) => (
                <Text key={y} style={styles.yAxisLabel}>
                  {y}
                </Text>
              ))}
            </View>
            <View style={styles.chartArea} onLayout={(e) => setChartWidth(Math.round(e.nativeEvent.layout.width))}>
              {chartWidth > 0 ? (
                <Svg width={chartWidth} height={CHART_HEIGHT} viewBox={`0 0 ${chartWidth} ${CHART_HEIGHT}`}>
                  <Rect
                    x={0}
                    y={bandTop}
                    width={chartWidth}
                    height={Math.max(bandBottom - bandTop, 0)}
                    fill={`${Colors.success}1A`}
                  />
                  {dayPoints.length > 1 ? (
                    <Polyline
                      points={svgPoints}
                      fill="none"
                      stroke={Colors.primary}
                      strokeWidth={2}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null}
                  {dayPoints.map((p, i) => (
                    <Circle
                      key={p.dateKey}
                      cx={xFor(i)}
                      cy={yFor(p.value)}
                      r={5}
                      fill={BUCKET_COLOR[bucketFor(p.value)]}
                      stroke="white"
                      strokeWidth={1.5}
                    />
                  ))}
                </Svg>
              ) : null}
            </View>
          </View>

          <View style={styles.xAxisRow}>
            {dayPoints.map((p, i) => (
              <Text key={p.dateKey} style={styles.xAxisLabel}>
                {i % labelEvery === 0 ? p.label : ''}
              </Text>
            ))}
          </View>

          <Text style={styles.targetRangeCaption}>
            Target range {TARGET_LOW} - {TARGET_HIGH} mg/dL
          </Text>
        </>
      )}
    </View>
  );
}

export default function TrackRegularlyScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [days, setDays] = useState(7);
  const [readings, setReadings] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async (selectedDays) => {
    setIsLoading(true);
    try {
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
    } catch {
      setReadings([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const sorted = [...readings].sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));

  // One point per calendar day (the day's average) so a 30/90-day chart stays
  // readable instead of plotting every single raw reading.
  const byDay = new Map();
  sorted.forEach((r) => {
    const d = new Date(r.logged_at);
    const dateKey = d.toDateString();
    if (!byDay.has(dateKey)) byDay.set(dateKey, { total: 0, count: 0, date: d });
    const bucket = byDay.get(dateKey);
    bucket.total += r.value_mg_dl;
    bucket.count += 1;
  });
  const dayPoints = Array.from(byDay.entries()).map(([dateKey, b]) => ({
    dateKey,
    value: Math.round(b.total / b.count),
    label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(b.date),
  }));

  const average = readings.length
    ? Math.round(readings.reduce((sum, r) => sum + r.value_mg_dl, 0) / readings.length)
    : null;

  const inRangeCount = readings.filter((r) => bucketFor(r.value_mg_dl) === 'inRange').length;
  const highCount = readings.filter((r) => bucketFor(r.value_mg_dl) === 'high').length;
  const lowCount = readings.filter((r) => r.value_mg_dl < TARGET_LOW).length;
  const total = readings.length || 1;
  const pct = (n) => Math.round((n / total) * 100);

  const rangeLabel =
    dayPoints.length > 0
      ? `${dayPoints[0].label} - ${dayPoints[dayPoints.length - 1].label}`
      : `Last ${days} days`;

  const recentReadings = [...readings]
    .sort((a, b) => new Date(b.logged_at) - new Date(a.logged_at))
    .slice(0, 3);

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.headerButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Track regularly</Text>
              <Text style={styles.headerSubtitle}>See your glucose patterns over time</Text>
            </View>
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => navigation.navigate('FoodLog')}
              activeOpacity={0.85}
            >
              <Ionicons name="calendar-outline" size={20} color="white" />
            </TouchableOpacity>
          </View>

          <View style={styles.rangeRow}>
            {RANGE_OPTIONS.map((opt) => {
              const selected = days === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={[styles.rangeChip, selected && styles.rangeChipActive]}
                  onPress={() => setDays(opt.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.rangeChipText, selected && styles.rangeChipTextActive]}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.loadingState}>
              <ActivityIndicator size="large" color={Colors.primary} />
            </View>
          ) : (
            <>
              <GlucoseTrendCard dayPoints={dayPoints} average={average} rangeLabel={rangeLabel} />

              <View style={styles.statsCard}>
                <View style={styles.statColumn}>
                  <Ring percent={pct(inRangeCount)} color={Colors.success} />
                  <Text style={styles.statPercent}>{pct(inRangeCount)}%</Text>
                  <Text style={styles.statLabel}>In range</Text>
                  <Text style={styles.statSublabel}>
                    {TARGET_LOW} - {TARGET_HIGH} mg/dL
                  </Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statColumn}>
                  <Ring percent={pct(highCount)} color="#D97706" />
                  <Text style={styles.statPercent}>{pct(highCount)}%</Text>
                  <Text style={styles.statLabel}>High</Text>
                  <Text style={styles.statSublabel}>&gt; {TARGET_HIGH} mg/dL</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statColumn}>
                  <Ring percent={pct(lowCount)} color={Colors.danger} />
                  <Text style={styles.statPercent}>{pct(lowCount)}%</Text>
                  <Text style={styles.statLabel}>Low</Text>
                  <Text style={styles.statSublabel}>&lt; {TARGET_LOW} mg/dL</Text>
                </View>
              </View>

              <View style={styles.recentCard}>
                <View style={styles.recentHeaderRow}>
                  <Text style={styles.cardTitle}>Recent readings</Text>
                  <TouchableOpacity onPress={() => navigation.navigate('FoodLog')} activeOpacity={0.8}>
                    <View style={styles.seeAllRow}>
                      <Text style={styles.seeAllText}>See all</Text>
                      <Ionicons name="chevron-forward" size={14} color={Colors.primary} />
                    </View>
                  </TouchableOpacity>
                </View>

                {recentReadings.length === 0 ? (
                  <Text style={styles.emptyText}>No readings yet.</Text>
                ) : (
                  recentReadings.map((r, idx) => {
                    const bucket = bucketFor(r.value_mg_dl);
                    return (
                      <TouchableOpacity
                        key={r.id}
                        style={[styles.recentRow, idx === recentReadings.length - 1 && { borderBottomWidth: 0 }]}
                        onPress={() => navigation.navigate('FoodLog')}
                        activeOpacity={0.75}
                      >
                        <View style={[styles.recentDot, { backgroundColor: BUCKET_COLOR[bucket] }]} />
                        <Text style={styles.recentValue}>{r.value_mg_dl} mg/dL</Text>
                        <Text style={styles.recentTime}>{formatRelativeDateTime(r.logged_at)}</Text>
                        <View style={[styles.recentBadge, { backgroundColor: `${BUCKET_COLOR[bucket]}1A` }]}>
                          <Text style={[styles.recentBadgeText, { color: BUCKET_COLOR[bucket] }]}>
                            {BUCKET_LABEL[bucket]}
                          </Text>
                        </View>
                        <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
                      </TouchableOpacity>
                    );
                  })
                )}
              </View>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerPanel: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  headerButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1, marginLeft: 12, marginRight: 12 },
  headerTitle: { fontSize: 20, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '700' },
  rangeRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  rangeChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  rangeChipActive: { backgroundColor: Colors.success },
  rangeChipText: { fontSize: 13, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
  rangeChipTextActive: { color: 'white' },
  content: { padding: 20, gap: 16 },
  loadingState: { paddingVertical: 60, alignItems: 'center' },
  card: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 17, fontWeight: '900', color: Colors.text },
  cardSubtitle: { marginTop: 3, fontSize: 12.5, fontWeight: '700', color: Colors.textLight },
  averageBadge: {
    alignItems: 'center',
    backgroundColor: `${Colors.success}18`,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  averageValue: { fontSize: 22, fontWeight: '900', color: Colors.text },
  averageLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textLight, textAlign: 'center', marginTop: 1 },
  emptyText: { marginTop: 12, fontSize: 13, color: Colors.textLight, fontWeight: '600' },
  yAxisRow: { flexDirection: 'row', marginTop: 18 },
  yAxisLabels: { justifyContent: 'space-between', paddingBottom: 26, paddingTop: 16, height: CHART_HEIGHT },
  yAxisLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, width: 28 },
  chartArea: { flex: 1, height: CHART_HEIGHT },
  xAxisRow: { flexDirection: 'row', marginLeft: 28 },
  xAxisLabel: { flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: Colors.textMuted },
  targetRangeCaption: { marginTop: 10, fontSize: 11.5, fontWeight: '700', color: Colors.textLight, textAlign: 'right' },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statColumn: { flex: 1, alignItems: 'center', gap: 6 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: Colors.border, marginHorizontal: 4 },
  statPercent: { fontSize: 16, fontWeight: '900', color: Colors.text },
  statLabel: { fontSize: 12, fontWeight: '800', color: Colors.text },
  statSublabel: { fontSize: 10, fontWeight: '600', color: Colors.textMuted, textAlign: 'center' },
  recentCard: {
    padding: 18,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recentHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 13, fontWeight: '800', color: Colors.primary },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.background,
  },
  recentDot: { width: 10, height: 10, borderRadius: 5 },
  recentValue: { fontSize: 14, fontWeight: '800', color: Colors.text, width: 84 },
  recentTime: { flex: 1, fontSize: 12.5, fontWeight: '600', color: Colors.textLight },
  recentBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  recentBadgeText: { fontSize: 11.5, fontWeight: '800' },
});
