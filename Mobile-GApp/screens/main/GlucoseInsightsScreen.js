// screens/main/GlucoseInsightsScreen.js
// "Glucose insights": Trends / Food impact / Patterns. Readings are judged by the backend
// against the user's own targets; the insight texts come from fixed rules over the
// user's own data (backend services/glucose_insights.py) - observations, never advice.
import React, { useCallback, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView } from 'react-native';
import { useNavigation, useFocusEffect, useRoute } from '@react-navigation/native';
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

const TABS = [
  { key: 'trends', label: 'Trends' },
  { key: 'food', label: 'Food impact' },
  { key: 'patterns', label: 'Patterns' },
];
const TREND_RANGES = [7, 30, 90];
const INSIGHT_RANGES = [30, 90]; // food and patterns need more than a week of data
const UNITS = ['mg/dL', 'mmol/L'];
const AMBER = '#B7791F';
const RED = '#C53030';
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

// ---------- shared pieces ----------

function RangeChips({ options, value, onChange }) {
  return (
    <View style={styles.rangeRow}>
      {options.map((d) => {
        const active = value === d;
        return (
          <TouchableOpacity
            key={d}
            style={[styles.rangeChip, active && styles.rangeChipActive]}
            onPress={() => onChange(d)}
            activeOpacity={0.85}
          >
            <Text style={[styles.rangeChipText, active && styles.rangeChipTextActive]}>{d} days</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function KeyInsights({ items, emptyText }) {
  if (!items?.length && !emptyText) return null;
  return (
    <View style={styles.keyCard}>
      <View style={styles.keyBulb}>
        <Ionicons name="bulb" size={20} color="#DD6B20" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.keyTitle}>Key insights</Text>
        {items?.length ? (
          items.map((text) => (
            <View key={text} style={styles.keyRow}>
              <Text style={styles.keyDot}>•</Text>
              <Text style={styles.keyText}>{text}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.keyText}>{emptyText}</Text>
        )}
      </View>
    </View>
  );
}

function NeedMore({ icon, title, body, actionLabel, onPress }) {
  return (
    <View style={styles.needCard}>
      <View style={styles.needIcon}>
        <Ionicons name={icon} size={24} color={Colors.primary} />
      </View>
      <Text style={styles.needTitle}>{title}</Text>
      <Text style={styles.needBody}>{body}</Text>
      {actionLabel ? (
        <TouchableOpacity style={styles.primaryBtn} onPress={onPress} activeOpacity={0.88}>
          <Text style={styles.primaryBtnText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// Split bar: share on target (green) vs above (amber) vs the rest.
function ShareBar({ onTarget, above = 0, total }) {
  const t = Math.max(total, 1);
  return (
    <View style={styles.shareBar}>
      <View style={{ flex: onTarget / t, backgroundColor: Colors.success }} />
      <View style={{ flex: above / t, backgroundColor: AMBER }} />
      <View style={{ flex: Math.max(0, total - onTarget - above) / t, backgroundColor: '#E2E8F0' }} />
    </View>
  );
}

// ---------- Trends ----------

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
    const opts = days <= 7 ? { weekday: 'short' } : { month: 'short', day: 'numeric' };
    return { ms, label: new Intl.DateTimeFormat(undefined, opts).format(new Date(ms)) };
  });

  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View>
          <Text style={styles.cardTitle}>Your glucose trend</Text>
          <Text style={styles.cardSubtitle}>Daily average · {rangeLabel}</Text>
        </View>
        {average != null ? (
          <View style={styles.averageBadge}>
            <Text style={styles.averageValue}>{num(average, unit)}</Text>
            <Text style={styles.averageLabel}>Average{'\n'}{unit}</Text>
          </View>
        ) : null}
      </View>
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
                <Line key={`v-${i}`} x1={xFor(t.ms)} y1={PAD_TOP} x2={xFor(t.ms)} y2={CHART_HEIGHT - PAD_BOTTOM} stroke="#EEF0EA" strokeWidth={1} strokeDasharray="3,4" />
              ))}
              {dayPoints.length > 1 ? (
                <Polyline points={svgPoints} fill="none" stroke={Colors.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
              ) : null}
              {dayPoints.map((p) => (
                <Circle key={p.dateKey} cx={xFor(p.dateMs)} cy={yFor(p.value)} r={5} fill={dotColor(p.value)} stroke="white" strokeWidth={1.5} />
              ))}
              <SvgText x={chartWidth - 4} y={Math.max(bandTop + 12, PAD_TOP + 10)} fontSize={9.5} fontWeight="700" fill={Colors.success} textAnchor="end">
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
    </View>
  );
}

function TrendsTab({ days, setDays, readings, targets, insights, unit, loading, navigation }) {
  const sorted = [...readings].sort((a, b) => parseServerDate(a.logged_at) - parseServerDate(b.logged_at));
  const byDay = new Map();
  sorted.forEach((r) => {
    const d = parseServerDate(r.logged_at);
    const key = d.toDateString();
    if (!byDay.has(key)) byDay.set(key, { total: 0, count: 0, date: d });
    const b = byDay.get(key);
    b.total += r.value_mg_dl;
    b.count += 1;
  });
  const dayPoints = [...byDay.entries()].map(([dateKey, b]) => ({ dateKey, dateMs: b.date.getTime(), value: Math.round(b.total / b.count) }));

  const now = new Date();
  const windowStart = new Date(now);
  windowStart.setDate(windowStart.getDate() - (days - 1));
  windowStart.setHours(0, 0, 0, 0);
  const fmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  const average = readings.length ? Math.round(readings.reduce((s, r) => s + r.value_mg_dl, 0) / readings.length) : null;
  const count = (fn) => readings.filter(fn).length;
  const onTarget = count((r) => r.status === 'in_range');
  const above = count((r) => r.status === 'above' || r.status === 'very_high');
  const below = count((r) => r.status === 'below' || r.status === 'low');
  const total = readings.length || 1;
  const pct = (n) => Math.round((n / total) * 100);
  const recent = [...sorted].reverse().slice(0, 5);
  const openAll = () => navigation.navigate('FoodLog', { initialFilter: 'glucose' });

  return (
    <>
      <RangeChips options={TREND_RANGES} value={days} onChange={setDays} />
      {loading && !readings.length ? (
        <ActivityIndicator style={{ paddingVertical: 48 }} size="large" color={Colors.primary} />
      ) : !readings.length ? (
        <NeedMore
          icon="water-outline"
          title={`No readings in the last ${days} days`}
          body="Log your glucose and your trend will build up here."
          actionLabel="Log glucose"
          onPress={() => navigation.navigate('LogGlucose')}
        />
      ) : (
        <>
          <GlucoseTrendCard
            dayPoints={dayPoints}
            average={average}
            rangeLabel={`${fmt.format(windowStart)} – ${fmt.format(now)}`}
            unit={unit}
            windowStartMs={windowStart.getTime()}
            windowEndMs={now.getTime()}
            days={days}
            bandHigh={targets?.postmeal_high || 180}
          />
          <KeyInsights items={insights} />
          <View style={styles.card}>
            <Text style={[styles.cardTitle, { marginBottom: 14 }]}>
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
          </View>
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
              <TouchableOpacity onPress={openAll} hitSlop={8}>
                <Text style={styles.link}>See all ›</Text>
              </TouchableOpacity>
            </View>
            {recent.map((r, idx) => {
              const meta = statusMeta(r.status);
              return (
                <TouchableOpacity
                  key={r.id}
                  style={[styles.listRow, idx === recent.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={openAll}
                  activeOpacity={0.75}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rowTitle}>{formatGlucose(r.value_mg_dl, unit)}</Text>
                    <Text style={styles.rowMeta} numberOfLines={1}>
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
    </>
  );
}

// ---------- Food impact ----------

function FoodRow({ food, kind, unit, onPress, last }) {
  const isWatch = kind === 'watch';
  const color = isWatch ? AMBER : Colors.success;
  return (
    <TouchableOpacity style={[styles.listRow, last && { borderBottomWidth: 0 }]} onPress={onPress} activeOpacity={0.75}>
      <View style={[styles.foodIcon, { backgroundColor: `${color}1A` }]}>
        <Ionicons name={isWatch ? 'trending-up' : 'checkmark'} size={16} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{food.name}</Text>
        <Text style={styles.rowMeta}>
          {isWatch ? `Above target ${food.above} of ${food.times} times` : `On target ${food.on_target} of ${food.times} times`}
          {` · avg after ${formatGlucose(food.avg_after_mg_dl, unit)}`}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={Colors.textMuted} />
    </TouchableOpacity>
  );
}

// "Your carbs": insights from logged meals alone (no readings needed).
function CarbsCard({ food }) {
  const items = food?.carb_insights || [];
  if (!items.length) return null;
  const c = food.carbs || {};
  return (
    <View style={styles.card}>
      <View style={styles.cardHeaderRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>Your carbs</Text>
          <Text style={styles.cardSubtitle}>From the meals you logged this week</Text>
        </View>
        {c.avg_carbs_g != null ? (
          <View style={styles.averageBadge}>
            <Text style={styles.averageValue}>{c.avg_carbs_g}g</Text>
            <Text style={styles.averageLabel}>per meal{c.per_meal_guide_g ? `\nguide ${c.per_meal_guide_g}g` : ''}</Text>
          </View>
        ) : null}
      </View>
      {items.map((text) => (
        <View key={text} style={styles.carbRow}>
          <Ionicons name="nutrition" size={15} color={Colors.primary} />
          <Text style={styles.carbText}>{text}</Text>
        </View>
      ))}
    </View>
  );
}

function FoodTab({ days, setDays, data, unit, loading, navigation }) {
  const food = data?.food;
  const openMeals = (f) => navigation.navigate('FoodLog', { mealIds: f.meal_ids, focusTitle: f.name });
  return (
    <>
      <RangeChips options={INSIGHT_RANGES} value={days} onChange={setDays} />
      {loading && !food ? (
        <ActivityIndicator style={{ paddingVertical: 48 }} size="large" color={Colors.primary} />
      ) : !food ? null : food.needed > 0 ? (
        <>
        <CarbsCard food={food} />
        <NeedMore
          icon="restaurant-outline"
          title="See how your meals affect you"
          body={`Log a meal, then your glucose about 2 hours later. ${food.needed} more meal${food.needed === 1 ? '' : 's'} with an after-meal reading and your food impact appears here.`}
          actionLabel="Log a meal"
          onPress={() => navigation.navigate('LogMeal')}
        />
        </>
      ) : (
        <>
          <KeyInsights
            items={food.insights}
            emptyText="No clear patterns yet. Keep pairing meals with a reading about 2 hours later."
          />
          <CarbsCard food={food} />
          {food.foods_to_watch.length ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Foods to watch</Text>
              <Text style={styles.cardSubtitle}>Often above target after eating</Text>
              {food.foods_to_watch.map((f, i) => (
                <FoodRow key={f.key} food={f} kind="watch" unit={unit} onPress={() => openMeals(f)} last={i === food.foods_to_watch.length - 1} />
              ))}
            </View>
          ) : null}
          {food.foods_that_work.length ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Foods that work for you</Text>
              <Text style={styles.cardSubtitle}>Usually on target after eating</Text>
              {food.foods_that_work.map((f, i) => (
                <FoodRow key={f.key} food={f} kind="works" unit={unit} onPress={() => openMeals(f)} last={i === food.foods_that_work.length - 1} />
              ))}
            </View>
          ) : null}
          {food.carb_bands.length ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Carbs and your readings</Text>
              <Text style={styles.cardSubtitle}>After-meal results by carbs in the meal</Text>
              {food.carb_bands.map((b) => (
                <View key={b.key} style={styles.bandRow}>
                  <View style={styles.bandHead}>
                    <Text style={styles.bandLabel}>{b.label}</Text>
                    <Text style={styles.bandValue}>
                      On target {b.on_target} of {b.checked}
                    </Text>
                  </View>
                  <ShareBar onTarget={b.on_target} above={b.above} total={b.checked} />
                </View>
              ))}
            </View>
          ) : null}
          <Text style={styles.footnote}>
            Based on {food.checked_meals} meal{food.checked_meals === 1 ? '' : 's'} with a reading 30 min to 3 hours after
            eating. A food appears once it has been checked at least twice.
          </Text>
        </>
      )}
    </>
  );
}

// ---------- Patterns ----------

function PatternsTab({ days, setDays, data, unit, loading, navigation }) {
  const p = data?.patterns;
  return (
    <>
      <RangeChips options={INSIGHT_RANGES} value={days} onChange={setDays} />
      {loading && !p ? (
        <ActivityIndicator style={{ paddingVertical: 48 }} size="large" color={Colors.primary} />
      ) : !p ? null : p.needed > 0 ? (
        <NeedMore
          icon="time-outline"
          title="Patterns need a few more readings"
          body={`Log ${p.needed} more reading${p.needed === 1 ? '' : 's'} at different times of day to see when your glucose tends to run high or low.`}
          actionLabel="Log glucose"
          onPress={() => navigation.navigate('LogGlucose')}
        />
      ) : (
        <>
          <KeyInsights items={p.insights} emptyText="No strong patterns yet. Readings at different times of day help." />
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Time of day</Text>
            <Text style={styles.cardSubtitle}>How often you were on target</Text>
            {p.time_slots.map((s) => (
              <View key={s.key} style={styles.bandRow}>
                <View style={styles.bandHead}>
                  <Text style={styles.bandLabel}>{s.label}</Text>
                  <Text style={styles.bandValue}>
                    {s.on_target} of {s.readings} · avg {formatGlucose(s.avg_mg_dl, unit)}
                  </Text>
                </View>
                <ShareBar onTarget={s.on_target} total={s.readings} />
              </View>
            ))}
          </View>
          {p.weekday.readings && p.weekend.readings ? (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Weekdays vs weekends</Text>
              <View style={styles.statsRow}>
                {[
                  { label: 'Weekdays', v: p.weekday },
                  { label: 'Weekends', v: p.weekend },
                ].map((w, i) => (
                  <React.Fragment key={w.label}>
                    {i ? <View style={styles.statDivider} /> : null}
                    <View style={[styles.statColumn, { paddingTop: 12 }]}>
                      <Text style={styles.statPercent}>{Math.round((w.v.on_target / w.v.readings) * 100)}%</Text>
                      <Text style={styles.statLabel}>{w.label}</Text>
                      <Text style={styles.statSublabel}>
                        {w.v.on_target} of {w.v.readings} on target
                      </Text>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : null}
          <Text style={styles.footnote}>Times are in your phone's time zone. Based on {p.readings} readings.</Text>
        </>
      )}
    </>
  );
}

// ---------- screen ----------

export default function GlucoseInsightsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [tab, setTab] = useState(TABS.some((t) => t.key === route.params?.tab) ? route.params.tab : 'trends');
  const [trendDays, setTrendDays] = useState(7);
  const [insightDays, setInsightDays] = useState(30);
  const [readings, setReadings] = useState([]);
  const [targets, setTargets] = useState(null);
  const [insightsByDays, setInsightsByDays] = useState({});
  const [loading, setLoading] = useState(true);
  const [unit, setUnit] = useState('mg/dL');

  const switchUnit = (u) => {
    setUnit(u);
    setGlucoseUnit(u);
  };

  const authGet = async (path) => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return null;
    const res = await apiFetch(`${API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } }, { timeoutMs: 12000 });
    return res.ok ? res.json() : null;
  };

  const loadInsights = useCallback(async (d) => {
    const tz = -new Date().getTimezoneOffset();
    const data = await authGet(`/api/app/health-log/insights?days=${d}&tz_offset_minutes=${tz}`);
    if (data) setInsightsByDays((cur) => ({ ...cur, [d]: data }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUnit(await getGlucoseUnit());
      const [glucose] = await Promise.all([
        authGet(`/api/app/glucose?days=${trendDays}`),
        loadInsights(trendDays),
        trendDays === insightDays ? null : loadInsights(insightDays),
      ]);
      setReadings(glucose?.items || []);
      setTargets(glucose?.targets || null);
    } catch {
      // Keep what's on screen.
    } finally {
      setLoading(false);
    }
  }, [trendDays, insightDays, loadInsights]);

  // Refetch on every focus, so a reading logged elsewhere shows on return.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const shared = { unit, loading, navigation };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Glucose insights</Text>
            <Text style={styles.headerSubtitle}>What your own readings show</Text>
          </View>
          <View style={styles.unitSwitch}>
            {UNITS.map((u) => (
              <TouchableOpacity key={u} style={[styles.unitItem, unit === u && styles.unitItemActive]} onPress={() => switchUnit(u)}>
                <Text style={[styles.unitText, unit === u && styles.unitTextActive]}>{u === 'mg/dL' ? 'mg' : 'mmol'}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
        <View style={styles.tabs}>
          {TABS.map((t) => {
            const active = tab === t.key;
            return (
              <TouchableOpacity key={t.key} style={[styles.tab, active && styles.tabActive]} onPress={() => setTab(t.key)} activeOpacity={0.85}>
                <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]}>
        {tab === 'trends' ? (
          <TrendsTab
            {...shared}
            days={trendDays}
            setDays={setTrendDays}
            readings={readings}
            targets={targets}
            insights={insightsByDays[trendDays]?.trends?.insights}
          />
        ) : tab === 'food' ? (
          <FoodTab {...shared} days={insightDays} setDays={setInsightDays} data={insightsByDays[insightDays]} />
        ) : (
          <PatternsTab {...shared} days={insightDays} setDays={setInsightDays} data={insightsByDays[insightDays]} />
        )}
        <Text style={styles.disclaimer}>
          Insights describe your own logged data. They are not medical advice; talk to your healthcare team before changing
          your treatment.
        </Text>
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
  unitSwitch: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: 3 },
  unitItem: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999 },
  unitItemActive: { backgroundColor: 'white' },
  unitText: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  unitTextActive: { color: Colors.primaryDark },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 16 },
  tab: { flex: 1, height: 38, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.12)', alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: 'white' },
  tabText: { fontSize: 13.5, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  tabTextActive: { color: Colors.primaryDark },
  content: { padding: 16, gap: 12 },
  rangeRow: { flexDirection: 'row', gap: 8 },
  rangeChip: { flex: 1, height: 36, borderRadius: 999, backgroundColor: 'white', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' },
  rangeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  rangeChipText: { fontSize: 13, fontWeight: '800', color: Colors.brandNavy },
  rangeChipTextActive: { color: 'white' },
  card: { padding: 16, borderRadius: 18, backgroundColor: 'white', borderWidth: 1, borderColor: '#E9ECE4' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  cardSubtitle: { marginTop: 2, fontSize: 12.5, fontWeight: '600', color: Colors.textLight },
  averageBadge: { alignItems: 'center', backgroundColor: '#E8F4F3', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  averageValue: { fontSize: 20, fontWeight: '900', color: Colors.brandNavy },
  averageLabel: { fontSize: 10, fontWeight: '700', color: Colors.textLight, textAlign: 'center' },
  yAxisRow: { flexDirection: 'row', marginTop: 14 },
  yAxisLabels: { justifyContent: 'space-between', paddingBottom: 26, paddingTop: 16, height: CHART_HEIGHT },
  yAxisLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textMuted, width: 34 },
  chartArea: { flex: 1, height: CHART_HEIGHT },
  xAxisRow: { flexDirection: 'row', marginLeft: 34 },
  xAxisLabel: { flex: 1, textAlign: 'center', fontSize: 10.5, fontWeight: '700', color: Colors.textMuted },
  keyCard: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 18, backgroundColor: '#FFF8EE', borderWidth: 1, borderColor: '#FBE3C4' },
  keyBulb: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#FFEBD2', alignItems: 'center', justifyContent: 'center' },
  keyTitle: { fontSize: 15, fontWeight: '900', color: Colors.brandNavy, marginBottom: 4 },
  keyRow: { flexDirection: 'row', gap: 6, marginTop: 3 },
  keyDot: { fontSize: 14, color: '#DD6B20', lineHeight: 20 },
  keyText: { flex: 1, fontSize: 13.5, color: Colors.brandNavy, lineHeight: 20 },
  statsRow: { flexDirection: 'row', alignItems: 'center' },
  statColumn: { flex: 1, alignItems: 'center', gap: 5 },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: '#EEF0EA', marginHorizontal: 4 },
  statPercent: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  statLabel: { fontSize: 12, fontWeight: '800', color: Colors.brandNavy },
  statSublabel: { fontSize: 10.5, color: Colors.textMuted, textAlign: 'center' },
  targetsCard: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14, borderRadius: 16, backgroundColor: '#E8F4F3' },
  targetsTitle: { fontSize: 13.5, fontWeight: '900', color: Colors.brandNavy },
  targetsText: { fontSize: 12, color: Colors.brandNavy, marginTop: 2 },
  link: { fontSize: 13, fontWeight: '900', color: Colors.primary },
  listRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F0F2EC' },
  rowTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.brandNavy },
  rowMeta: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  foodIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bandRow: { marginTop: 14 },
  bandHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  bandLabel: { fontSize: 13.5, fontWeight: '800', color: Colors.brandNavy },
  bandValue: { fontSize: 12.5, color: Colors.textLight },
  shareBar: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#E2E8F0' },
  needCard: { alignItems: 'center', padding: 22, borderRadius: 18, backgroundColor: 'white', borderWidth: 1, borderColor: '#E9ECE4' },
  needIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: '#E8F4F3', alignItems: 'center', justifyContent: 'center' },
  needTitle: { fontSize: 17, fontWeight: '900', color: Colors.brandNavy, marginTop: 12, textAlign: 'center' },
  needBody: { fontSize: 13.5, color: Colors.textLight, marginTop: 6, textAlign: 'center', lineHeight: 20 },
  primaryBtn: { backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 20, height: 46, justifyContent: 'center', marginTop: 16 },
  primaryBtnWide: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.primary, borderRadius: 14, height: 50 },
  primaryBtnText: { color: 'white', fontWeight: '900', fontSize: 15 },
  carbRow: { flexDirection: 'row', gap: 8, paddingVertical: 6 },
  carbText: { flex: 1, fontSize: 13.5, lineHeight: 19, color: Colors.brandNavy },
  footnote: { fontSize: 11.5, color: Colors.textMuted, textAlign: 'center', lineHeight: 17, paddingHorizontal: 8 },
  disclaimer: { fontSize: 11, color: Colors.textMuted, textAlign: 'center', lineHeight: 16, marginTop: 8 },
});
