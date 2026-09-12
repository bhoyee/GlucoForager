// screens/main/WeeklyRecapScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Polyline, Circle, Rect } from 'react-native-svg';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import StatRing from '../../components/StatRing';

const FEELING_META = {
  great: { emoji: '🙂', label: 'Great' },
  ok: { emoji: '😐', label: 'OK' },
  not_great: { emoji: '🙁', label: 'Not great' },
};

const UNIT_PREF_KEY = 'glucose_unit_pref_v1';
const MGDL_PER_MMOL = 18.0182;
const TARGET_LOW = 70;
const TARGET_HIGH = 180;

function formatGlucose(valueMgDl, unit) {
  if (valueMgDl == null) return '--';
  if (unit === 'mmol/L') return (valueMgDl / MGDL_PER_MMOL).toFixed(1);
  return String(Math.round(valueMgDl));
}

// A compact 7-point sparkline for the week - deliberately simpler than the full
// Track Regularly chart (no range picker, no axis ticks): this screen's whole job
// is a fast glance back at the week, not a detailed trends session.
const SPARK_HEIGHT = 90;
const SPARK_PAD_X = 8;
const SPARK_PAD_Y = 12;
const SPARK_Y_MAX = 300;

function GlucoseSparkline({ readings, unit }) {
  const [width, setWidth] = useState(0);
  const points = [...readings]
    .filter((r) => r?.logged_at && Number.isFinite(r?.value_mg_dl))
    .sort((a, b) => new Date(a.logged_at) - new Date(b.logged_at));

  const plotWidth = Math.max(width - SPARK_PAD_X * 2, 1);
  const plotHeight = SPARK_HEIGHT - SPARK_PAD_Y * 2;
  const minTime = points.length ? new Date(points[0].logged_at).getTime() : 0;
  const maxTime = points.length ? new Date(points[points.length - 1].logged_at).getTime() : 0;
  const timeSpan = Math.max(maxTime - minTime, 1);

  const xFor = (t) => (points.length <= 1 ? SPARK_PAD_X : SPARK_PAD_X + ((t - minTime) / timeSpan) * plotWidth);
  const yFor = (v) => SPARK_PAD_Y + plotHeight - (Math.min(v, SPARK_Y_MAX) / SPARK_Y_MAX) * plotHeight;
  const bandTop = yFor(TARGET_HIGH);
  const bandBottom = yFor(TARGET_LOW);
  const svgPoints = points.map((p) => `${xFor(new Date(p.logged_at).getTime())},${yFor(p.value_mg_dl)}`).join(' ');

  return (
    <View style={styles.sparkSlot} onLayout={(e) => setWidth(Math.round(e.nativeEvent.layout.width))}>
      {width > 0 && points.length > 0 ? (
        <Svg width={width} height={SPARK_HEIGHT} viewBox={`0 0 ${width} ${SPARK_HEIGHT}`}>
          <Rect x={0} y={bandTop} width={width} height={Math.max(bandBottom - bandTop, 0)} fill={`${Colors.success}1A`} />
          {points.length > 1 ? (
            <Polyline
              points={svgPoints}
              fill="none"
              stroke={Colors.primary}
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ) : null}
          {points.map((p, idx) => {
            const isHigh = p.value_mg_dl > TARGET_HIGH;
            const isLow = p.value_mg_dl < TARGET_LOW;
            return (
              <Circle
                key={idx}
                cx={xFor(new Date(p.logged_at).getTime())}
                cy={yFor(p.value_mg_dl)}
                r={4}
                fill={isHigh || isLow ? Colors.danger : Colors.success}
                stroke="white"
                strokeWidth={1.5}
              />
            );
          })}
        </Svg>
      ) : (
        <Text style={styles.emptyItemsText}>No readings logged this week.</Text>
      )}
    </View>
  );
}

export default function WeeklyRecapScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 12, 12);

  const [recap, setRecap] = useState(null);
  const [readings, setReadings] = useState([]);
  const [unit, setUnit] = useState('mg/dL');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    AsyncStorage.getItem(UNIT_PREF_KEY)
      .then((stored) => {
        if (stored === 'mg/dL' || stored === 'mmol/L') setUnit(stored);
      })
      .catch(() => {});
  }, []);

  const loadRecap = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setRecap(null);
        setReadings([]);
        return;
      }
      const headers = { Authorization: `Bearer ${token}` };
      const [recapRes, glucoseRes] = await Promise.all([
        apiFetch(`${API_URL}${API_ENDPOINTS.RECAP_WEEKLY}`, { headers }, { onUnauthorized: signOut }),
        apiFetch(`${API_URL}/api/app/glucose?days=7`, { headers }, { timeoutMs: 12000 }),
      ]);
      if (recapRes.status === 401) {
        setRecap(null);
        setReadings([]);
        return;
      }
      if (!recapRes.ok) {
        Alert.alert('Error', 'Unable to load your weekly recap right now.');
        return;
      }
      const recapData = await recapRes.json().catch(() => ({}));
      setRecap(recapData);
      const glucoseData = glucoseRes.ok ? await glucoseRes.json().catch(() => null) : null;
      setReadings(glucoseData?.items || []);
    } catch (error) {
      Alert.alert('Error', 'Unable to load your weekly recap right now.');
    } finally {
      setIsLoading(false);
    }
  }, [signOut]);

  useEffect(() => {
    if (isFocused) {
      setIsLoading(true);
      loadRecap();
    }
  }, [isFocused, loadRecap]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading your recap...</Text>
      </View>
    );
  }

  const checkIns = recap?.check_ins || { great: 0, ok: 0, not_great: 0 };
  const totalCheckIns = checkIns.great + checkIns.ok + checkIns.not_great;
  const glucose = recap?.glucose || { readings_logged: 0, average_mg_dl: null, in_range_count: 0, high_count: 0, low_count: 0, spikes_flagged: 0 };
  const carbGoal = recap?.carb_goal || { goal_g: null, mode: 'none', days_logged: 0, days_met: null };
  const meals_logged = recap?.meals_logged || 0;

  const hasActivity =
    Boolean(recap) &&
    (recap.recipes_generated > 0 ||
      recap.favorites_added > 0 ||
      totalCheckIns > 0 ||
      recap.streak_days > 0 ||
      glucose.readings_logged > 0 ||
      meals_logged > 0);

  const glucoseTotal = glucose.readings_logged || 1;
  const inRangePct = Math.round((glucose.in_range_count / glucoseTotal) * 100);
  const highPct = Math.round((glucose.high_count / glucoseTotal) * 100);
  const lowPct = Math.round((glucose.low_count / glucoseTotal) * 100);
  const carbGoalPct =
    carbGoal.days_logged > 0 && carbGoal.days_met != null
      ? Math.round((carbGoal.days_met / carbGoal.days_logged) * 100)
      : 0;

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      >
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Weekly Recap</Text>
              <Text style={styles.headerSubtitle}>Last 7 days</Text>
            </View>
          </View>
        </View>

        <View style={styles.content}>
          {!hasActivity ? (
            <View style={styles.emptyContainer}>
              <Ionicons name="stats-chart-outline" size={90} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>Nothing to show yet</Text>
              <Text style={styles.emptySubtitle}>
                Generate a recipe, log a meal or glucose reading, or save a favorite — your
                weekly recap will show up here.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.statsRow}>
                <View style={styles.statTile}>
                  <View style={styles.statIcon}>
                    <Ionicons name="restaurant-outline" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.statValue}>{recap.recipes_generated}</Text>
                  <Text style={styles.statLabel}>Recipes made</Text>
                </View>
                <View style={styles.statTile}>
                  <View style={styles.statIcon}>
                    <Ionicons name="bookmark-outline" size={20} color={Colors.primary} />
                  </View>
                  <Text style={styles.statValue}>{recap.favorites_added}</Text>
                  <Text style={styles.statLabel}>Favorited</Text>
                </View>
                <View style={styles.statTile}>
                  <View style={styles.statIcon}>
                    <Ionicons name="flame" size={20} color={Colors.accent} />
                  </View>
                  <Text style={styles.statValue}>{recap.streak_days}</Text>
                  <Text style={styles.statLabel}>Day streak</Text>
                </View>
              </View>

              {glucose.readings_logged > 0 ? (
                <View style={styles.section}>
                  <View style={styles.sectionHeaderRow}>
                    <Text style={styles.sectionTitle}>Glucose this week</Text>
                    <TouchableOpacity onPress={() => navigation.navigate('TrackRegularly')} activeOpacity={0.8}>
                      <View style={styles.seeAllRow}>
                        <Text style={styles.seeAllText}>Full trends</Text>
                        <Ionicons name="chevron-forward" size={13} color={Colors.primary} />
                      </View>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.glucoseCard}>
                    <View style={styles.glucoseHeaderRow}>
                      <View>
                        <Text style={styles.glucoseAverageValue}>{formatGlucose(glucose.average_mg_dl, unit)}</Text>
                        <Text style={styles.glucoseAverageLabel}>Average {unit}</Text>
                      </View>
                      <Text style={styles.glucoseReadingsCount}>
                        {glucose.readings_logged} reading{glucose.readings_logged === 1 ? '' : 's'} logged
                      </Text>
                    </View>

                    <GlucoseSparkline readings={readings} unit={unit} />

                    <View style={styles.glucoseStatsRow}>
                      <View style={styles.glucoseStatColumn}>
                        <StatRing percent={inRangePct} color={Colors.success} size={48} strokeWidth={5} />
                        <Text style={styles.glucoseStatPercent}>{inRangePct}%</Text>
                        <Text style={styles.glucoseStatLabel}>In range</Text>
                      </View>
                      <View style={styles.glucoseStatColumn}>
                        <StatRing percent={highPct} color="#D97706" size={48} strokeWidth={5} />
                        <Text style={styles.glucoseStatPercent}>{highPct}%</Text>
                        <Text style={styles.glucoseStatLabel}>High</Text>
                      </View>
                      <View style={styles.glucoseStatColumn}>
                        <StatRing percent={lowPct} color={Colors.danger} size={48} strokeWidth={5} />
                        <Text style={styles.glucoseStatPercent}>{lowPct}%</Text>
                        <Text style={styles.glucoseStatLabel}>Low</Text>
                      </View>
                    </View>

                    {glucose.spikes_flagged > 0 ? (
                      <View style={styles.spikeNotice}>
                        <Ionicons name="alert-circle" size={13} color={Colors.warning} />
                        <Text style={styles.spikeNoticeText}>
                          {glucose.spikes_flagged} post-meal spike{glucose.spikes_flagged === 1 ? '' : 's'} flagged this week
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              ) : null}

              {carbGoal.mode !== 'none' && carbGoal.goal_g ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Carb goal</Text>
                  <View style={styles.carbGoalCard}>
                    {carbGoal.days_logged > 0 ? (
                      <>
                        <StatRing percent={carbGoalPct} color={Colors.success} size={52} strokeWidth={6} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.carbGoalHeadline}>
                            Met your goal {carbGoal.days_met} of {carbGoal.days_logged} logged day
                            {carbGoal.days_logged === 1 ? '' : 's'}
                          </Text>
                          <Text style={styles.carbGoalSubtext}>
                            {carbGoal.mode === 'floor' ? 'At least' : 'Target'} {carbGoal.goal_g}g carbs a day
                          </Text>
                        </View>
                      </>
                    ) : (
                      <Text style={styles.emptyItemsText}>
                        No meals with carb info logged this week yet - scan a barcode or food photo to start tracking
                        against your goal.
                      </Text>
                    )}
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>How meals made you feel</Text>
                {totalCheckIns === 0 ? (
                  <Text style={styles.emptyItemsText}>
                    No check-ins yet this week — log one from a recipe's detail screen.
                  </Text>
                ) : (
                  <View style={styles.feelingsCard}>
                    {Object.entries(FEELING_META).map(([key, meta]) => (
                      <View key={key} style={styles.feelingRow}>
                        <Text style={styles.feelingEmoji}>{meta.emoji}</Text>
                        <Text style={styles.feelingLabel}>{meta.label}</Text>
                        <Text style={styles.feelingCount}>{checkIns[key] || 0}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {recap.top_recipe ? (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Recipe of the week</Text>
                  <View style={styles.topRecipeCard}>
                    <View style={styles.topRecipeIcon}>
                      <Ionicons name="trophy-outline" size={22} color="white" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.topRecipeName} numberOfLines={2}>
                        {recap.top_recipe.name}
                      </Text>
                      <Text style={styles.topRecipeMeta}>
                        Logged "Great" {recap.top_recipe.great_count}{' '}
                        {recap.top_recipe.great_count === 1 ? 'time' : 'times'} this week
                      </Text>
                    </View>
                  </View>
                </View>
              ) : null}
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: { marginTop: 12, fontSize: 16, color: Colors.textLight },
  headerPanel: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  header: { flexDirection: 'row', alignItems: 'center' },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: { flex: 1, marginLeft: 12 },
  headerTitle: { fontSize: 21, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 2, fontSize: 13, color: 'rgba(255,255,255,0.78)', fontWeight: '600' },
  content: { paddingHorizontal: 20, paddingTop: 18 },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 20,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 20,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 24,
  },
  statTile: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  statIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statValue: { fontSize: 20, fontWeight: '900', color: Colors.text },
  statLabel: { marginTop: 2, fontSize: 11, fontWeight: '700', color: Colors.textLight, textAlign: 'center' },
  section: { marginBottom: 24 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  seeAllRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  seeAllText: { fontSize: 12.5, fontWeight: '800', color: Colors.primary },
  emptyItemsText: { fontSize: 13, color: Colors.textLight, lineHeight: 19 },
  glucoseCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  glucoseHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  glucoseAverageValue: { fontSize: 26, fontWeight: '900', color: Colors.text },
  glucoseAverageLabel: { fontSize: 11.5, fontWeight: '700', color: Colors.textLight, marginTop: 2 },
  glucoseReadingsCount: { fontSize: 11.5, fontWeight: '700', color: Colors.textLight },
  sparkSlot: { marginTop: 12, minHeight: SPARK_HEIGHT, justifyContent: 'center' },
  glucoseStatsRow: { flexDirection: 'row', marginTop: 14, gap: 6 },
  glucoseStatColumn: { flex: 1, alignItems: 'center', gap: 3 },
  glucoseStatPercent: { fontSize: 13, fontWeight: '900', color: Colors.text },
  glucoseStatLabel: { fontSize: 10.5, fontWeight: '700', color: Colors.textLight },
  spikeNotice: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: `${Colors.warning}14`,
  },
  spikeNoticeText: { fontSize: 11.5, fontWeight: '700', color: Colors.warning, flexShrink: 1 },
  carbGoalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
  },
  carbGoalHeadline: { fontSize: 14, fontWeight: '800', color: Colors.text, lineHeight: 19 },
  carbGoalSubtext: { marginTop: 3, fontSize: 12, fontWeight: '600', color: Colors.textLight },
  feelingsCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 6,
  },
  feelingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  feelingEmoji: { fontSize: 20, marginRight: 10 },
  feelingLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: Colors.text },
  feelingCount: { fontSize: 16, fontWeight: '900', color: Colors.primary },
  topRecipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: `${Colors.accent}12`,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: `${Colors.accent}40`,
    padding: 14,
  },
  topRecipeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topRecipeName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  topRecipeMeta: { marginTop: 3, fontSize: 12, fontWeight: '600', color: Colors.textLight },
});
