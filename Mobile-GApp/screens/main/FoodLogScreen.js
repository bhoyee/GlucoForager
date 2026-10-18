// screens/main/FoodLogScreen.js
// "Meal diary": each meal paired with the glucose reading after it (and before it, if
// logged), judged against the user's own targets. Pairing happens on the backend
// (services/meal_diary.py); this screen groups by local day and handles patchy logging:
// meals with no reading, readings with no meal, and an empty diary all still make sense.
import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
} from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';
import { parseServerDate } from '../../utils/dateUtils';
import { CONTEXT_LABELS, MGDL_PER_MMOL, formatGlucose, getGlucoseUnit, statusMeta } from '../../utils/glucose';

const SOURCE_LABEL = { manual: 'Typed', barcode: 'Barcode', photo: 'Photo' };
const FILTERS = [
  { key: 'all', label: 'All', icon: 'apps-outline' },
  { key: 'meal', label: 'Meals', icon: 'restaurant-outline' },
  { key: 'glucose', label: 'Glucose', icon: 'water-outline' },
];
const CHECK_WINDOW_MS = 3 * 60 * 60 * 1000; // after this, a meal can no longer get an "after" reading
const IDEAL_CHECK_MS = 2 * 60 * 60 * 1000;

const timeOf = (iso) => {
  try {
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(parseServerDate(iso));
  } catch {
    return '';
  }
};

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function dayTitle(d) {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(d) === dayKey(today)) return 'Today';
  if (dayKey(d) === dayKey(yesterday)) return 'Yesterday';
  return new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
}

function gapLabel(fromIso, toIso) {
  const mins = Math.round((parseServerDate(toIso) - parseServerDate(fromIso)) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (!h) return `${m}m later`;
  return m ? `${h}h ${m}m later` : `${h}h later`;
}

// "On target" / "25 above target" / "1.4 below target" in the user's unit.
function verdict(reading, unit) {
  if (!reading) return '';
  if (reading.status === 'in_range') return 'On target';
  if (reading.status === 'low') return 'Low';
  if (reading.status === 'very_high') return 'Very high';
  const delta = Number(reading.delta_mg_dl) || 0;
  const amount = unit === 'mmol/L' ? (delta / MGDL_PER_MMOL).toFixed(1) : `${Math.round(delta)}`;
  return `${amount} ${reading.status} target`;
}

function riseLabel(rise, unit) {
  if (rise == null) return '';
  const amount = unit === 'mmol/L' ? (Math.abs(rise) / MGDL_PER_MMOL).toFixed(1) : `${Math.abs(rise)}`;
  return `${rise >= 0 ? '+' : '−'}${amount}`;
}

// Every reading in an item: standalone readings, plus a meal's before/after readings.
const readingsOf = (item) =>
  item.kind === 'glucose' ? [item] : [item.before, item.after].filter(Boolean);

export default function FoodLogScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();

  const [items, setItems] = useState([]);
  const [unit, setUnit] = useState('mg/dL');
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [filter, setFilter] = useState(route.params?.initialFilter === 'glucose' ? 'glucose' : 'all');
  const [selected, setSelected] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      setUnit(await getGlucoseUnit());
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const res = await apiFetch(
        `${API_URL}/api/app/health-log/diary?days=14`,
        { headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 12000 }
      );
      if (!res.ok) throw new Error('diary failed');
      setItems((await res.json())?.items || []);
      setLoadFailed(false);
    } catch {
      // Keep whatever was already on screen; only show the error if there's nothing.
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // Reload on focus so a reading logged from a "Log glucose" nudge shows up on return.
  useFocusEffect(
    useCallback(() => {
      load({ silent: items.length > 0 });
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load])
  );

  const hasMeals = items.some((i) => i.kind === 'meal');
  const hasReadings = items.some((i) => readingsOf(i).length > 0);

  const sections = useMemo(() => {
    let visible;
    if (filter === 'meal') visible = items.filter((i) => i.kind === 'meal');
    else if (filter === 'glucose') {
      // Every reading on its own, including ones paired with a meal.
      visible = items
        .flatMap(readingsOf)
        .map((r) => ({ ...r, kind: 'glucose' }))
        .sort((a, b) => parseServerDate(b.logged_at) - parseServerDate(a.logged_at));
    } else visible = items;

    const byDay = new Map();
    for (const item of visible) {
      const d = parseServerDate(item.logged_at);
      const k = dayKey(d);
      if (!byDay.has(k)) byDay.set(k, { key: k, date: d, data: [] });
      byDay.get(k).data.push(item);
    }
    // Day summary always counts the whole day, whatever the filter.
    return [...byDay.values()].map((section) => {
      const dayItems = items.filter((i) => dayKey(parseServerDate(i.logged_at)) === section.key);
      const meals = dayItems.filter((i) => i.kind === 'meal');
      const readings = dayItems.flatMap(readingsOf);
      const carbs = meals.reduce((sum, m) => sum + (Number(m.carbs_g) || 0), 0);
      const parts = [];
      if (meals.length) parts.push(`${meals.length} meal${meals.length === 1 ? '' : 's'}`);
      if (readings.length) {
        const onTarget = readings.filter((r) => r.status === 'in_range').length;
        parts.push(
          readings.length === 1
            ? `1 reading, ${onTarget ? 'on target' : 'off target'}`
            : `${onTarget} of ${readings.length} readings on target`
        );
      } else if (meals.length) parts.push('no readings');
      if (carbs) parts.push(`${Math.round(carbs)}g carbs`);
      return { ...section, title: dayTitle(section.date), summary: parts.join(' · ') };
    });
  }, [items, filter]);

  const logGlucoseAfter = () => navigation.navigate('LogGlucose', { context: 'after_meal' });

  const handleDelete = (item) => {
    const label = item.kind === 'meal' ? item.description : `${formatGlucose(item.value_mg_dl, unit)} reading`;
    Alert.alert('Delete entry', `Remove "${label}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            const token = await AsyncStorage.getItem('userToken');
            if (!token) return;
            const path = item.kind === 'meal' ? `meals/${item.id}` : `glucose/${item.id}`;
            const res = await apiFetch(
              `${API_URL}/api/app/${path}`,
              { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
              { timeoutMs: 8000 }
            );
            if (!res.ok) {
              Alert.alert('Unable to delete', 'Please try again.');
              return;
            }
            setSelected(null);
            // Re-pair on the server: removing one entry can change which readings belong to which meal.
            load({ silent: true });
          } catch {
            Alert.alert('Unable to delete', 'Network request failed. Please check your connection.');
          }
        },
      },
    ]);
  };

  const renderReadingLine = (label, reading) => {
    const meta = statusMeta(reading.status);
    return (
      <View style={styles.readingLine}>
        <Text style={styles.readingLabel}>{label}</Text>
        <Text style={styles.readingValue}>{formatGlucose(reading.value_mg_dl, unit)}</Text>
        <View style={[styles.pill, { backgroundColor: `${meta.color}1A` }]}>
          <Text style={[styles.pillText, { color: meta.color }]}>{verdict(reading, unit)}</Text>
        </View>
      </View>
    );
  };

  const renderMeal = (item) => {
    const age = Date.now() - parseServerDate(item.logged_at);
    const checkAt = new Date(parseServerDate(item.logged_at).getTime() + IDEAL_CHECK_MS);
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.8}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: '#E7F4E8' }]}>
            <Ionicons name="restaurant" size={17} color={Colors.success} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>{item.description}</Text>
            <Text style={styles.meta}>
              {timeOf(item.logged_at)}
              {item.carbs_g != null ? ` · ${Math.round(item.carbs_g)}g carbs` : ''}
            </Text>
          </View>
        </View>

        <View style={styles.pairBox}>
          {item.before ? renderReadingLine('Before', item.before) : null}
          {item.after ? (
            <>
              {renderReadingLine(gapLabel(item.logged_at, item.after.logged_at), item.after)}
              {item.rise_mg_dl != null ? (
                <Text style={styles.rise}>
                  Rose {riseLabel(item.rise_mg_dl, unit)} {unit} after this meal
                </Text>
              ) : null}
            </>
          ) : age < CHECK_WINDOW_MS ? (
            <View style={styles.nudge}>
              <Ionicons name="time-outline" size={15} color={Colors.primary} />
              <Text style={styles.nudgeText}>
                Check your glucose around {timeOf(checkAt.toISOString())} to see how this meal affected you
              </Text>
              <TouchableOpacity style={styles.nudgeBtn} onPress={logGlucoseAfter} activeOpacity={0.85}>
                <Text style={styles.nudgeBtnText}>Log glucose</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.noReading}>No after-meal reading</Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderReading = (item) => {
    const meta = statusMeta(item.status);
    return (
      <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.8}>
        <View style={styles.cardTop}>
          <View style={[styles.icon, { backgroundColor: '#E8F1FB' }]}>
            <Ionicons name="water" size={17} color="#2B6CB0" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{formatGlucose(item.value_mg_dl, unit)}</Text>
            <Text style={styles.meta} numberOfLines={1}>
              {timeOf(item.logged_at)}
              {item.context ? ` · ${CONTEXT_LABELS[item.context] || item.context}` : ''}
              {item.note ? ` · ${item.note}` : ''}
            </Text>
          </View>
          <View style={[styles.pill, { backgroundColor: `${meta.color}1A` }]}>
            <Text style={[styles.pillText, { color: meta.color }]}>{verdict(item, unit)}</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderEmpty = () => (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="book-outline" size={30} color={Colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>
        {loadFailed ? "Couldn't load your diary" : 'See how your meals affect your glucose'}
      </Text>
      <Text style={styles.emptyText}>
        {loadFailed
          ? 'Check your connection and pull down to try again.'
          : 'Log a meal, then check your glucose about 2 hours later. Your diary pairs them up so you can see which foods work for you.'}
      </Text>
      {!loadFailed ? (
        <View style={styles.emptyActions}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => navigation.navigate('LogMeal')} activeOpacity={0.88}>
            <Ionicons name="restaurant" size={16} color="white" />
            <Text style={styles.primaryBtnText}>Log a meal</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => navigation.navigate('LogGlucose')} activeOpacity={0.88}>
            <Ionicons name="water" size={16} color={Colors.primary} />
            <Text style={styles.secondaryBtnText}>Log glucose</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const trendsLink =
    filter === 'glucose' && hasReadings ? (
      <TouchableOpacity style={styles.tip} onPress={() => navigation.navigate('TrackRegularly')} activeOpacity={0.85}>
        <Ionicons name="trending-up" size={18} color={Colors.primary} />
        <Text style={styles.tipText}>Averages, charts and how often you're on target.</Text>
        <Text style={styles.tipLink}>See trends</Text>
      </TouchableOpacity>
    ) : null;

  const tip =
    hasReadings && !hasMeals && filter !== 'glucose' ? (
      <TouchableOpacity style={styles.tip} onPress={() => navigation.navigate('LogMeal')} activeOpacity={0.85}>
        <Ionicons name="bulb-outline" size={18} color={Colors.primary} />
        <Text style={styles.tipText}>Log what you eat to see which foods affect your readings.</Text>
        <Text style={styles.tipLink}>Log meal</Text>
      </TouchableOpacity>
    ) : null;

  const sel = selected;
  const selIsMeal = sel?.kind === 'meal';

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) }]}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Meal diary</Text>
            <Text style={styles.headerSubtitle}>How your meals affect your glucose · last 14 days</Text>
          </View>
        </View>
        <View style={styles.segment}>
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                style={[styles.segmentItem, active && styles.segmentItemActive]}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.85}
              >
                <Ionicons name={f.icon} size={14} color={active ? Colors.primaryDark : 'rgba(255,255,255,0.85)'} />
                <Text style={[styles.segmentText, active && styles.segmentTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {isLoading && !items.length ? (
        <ActivityIndicator style={{ marginTop: 48 }} size="large" color={Colors.primary} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.kind}-${item.id}`}
          renderItem={({ item }) => (item.kind === 'meal' ? renderMeal(item) : renderReading(item))}
          renderSectionHeader={({ section }) => (
            <View style={styles.dayHead}>
              <Text style={styles.dayTitle}>{section.title}</Text>
              {section.summary ? <Text style={styles.daySummary}>{section.summary}</Text> : null}
            </View>
          )}
          stickySectionHeadersEnabled={false}
          ListHeaderComponent={tip || trendsLink}
          ListEmptyComponent={
            items.length && filter !== 'all' ? (
              <Text style={styles.filterEmpty}>
                {filter === 'meal' ? 'No meals in the last 14 days.' : 'No glucose readings in the last 14 days.'}
              </Text>
            ) : (
              renderEmpty()
            )
          }
          contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 32 }}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => {
                setIsRefreshing(true);
                load({ silent: true });
              }}
              tintColor={Colors.primary}
            />
          }
        />
      )}

      <Modal visible={Boolean(sel)} transparent animationType="fade" onRequestClose={() => setSelected(null)}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            {sel ? (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={styles.sheetHead}>
                  <Text style={styles.sheetTitle} numberOfLines={3}>
                    {selIsMeal ? sel.description : formatGlucose(sel.value_mg_dl, unit)}
                  </Text>
                  <TouchableOpacity onPress={() => setSelected(null)} hitSlop={10}>
                    <Ionicons name="close" size={24} color={Colors.textLight} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.sheetTime}>
                  {dayTitle(parseServerDate(sel.logged_at))}, {timeOf(sel.logged_at)}
                </Text>

                {selIsMeal ? (
                  <>
                    <Row label="Logged via" value={SOURCE_LABEL[sel.source] || sel.source || 'Typed'} />
                    {sel.carbs_g != null ? <Row label="Carbs" value={`${Math.round(sel.carbs_g)}g`} /> : null}
                    {sel.calories != null ? <Row label="Calories" value={`${Math.round(sel.calories)}`} /> : null}
                    {sel.before ? (
                      <Row label="Before" value={`${formatGlucose(sel.before.value_mg_dl, unit)} · ${verdict(sel.before, unit)}`} />
                    ) : null}
                    {sel.after ? (
                      <Row
                        label={gapLabel(sel.logged_at, sel.after.logged_at)}
                        value={`${formatGlucose(sel.after.value_mg_dl, unit)} · ${verdict(sel.after, unit)}`}
                      />
                    ) : null}
                    {sel.rise_mg_dl != null ? <Row label="Rise" value={`${riseLabel(sel.rise_mg_dl, unit)} ${unit}`} /> : null}
                  </>
                ) : (
                  <>
                    <Row label="Result" value={verdict(sel, unit)} />
                    <Row label="Target" value={`${formatGlucose(sel.target_low, unit)} – ${formatGlucose(sel.target_high, unit)}`} />
                    {sel.context ? <Row label="When" value={CONTEXT_LABELS[sel.context] || sel.context} /> : null}
                    {sel.note ? <Row label="Note" value={sel.note} /> : null}
                  </>
                )}

                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(sel)} activeOpacity={0.85}>
                  <Ionicons name="trash-outline" size={16} color={Colors.danger} />
                  <Text style={styles.deleteText}>Delete {selIsMeal ? 'meal' : 'reading'}</Text>
                </TouchableOpacity>
              </ScrollView>
            ) : null}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function Row({ label, value }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
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
  segment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 12, padding: 4, marginTop: 14 },
  segmentItem: { flex: 1, height: 36, borderRadius: 9, flexDirection: 'row', gap: 5, alignItems: 'center', justifyContent: 'center' },
  segmentItemActive: { backgroundColor: 'white' },
  segmentText: { fontSize: 13.5, fontWeight: '800', color: 'rgba(255,255,255,0.85)' },
  segmentTextActive: { color: Colors.primaryDark },
  dayHead: { marginTop: 10, marginBottom: 8 },
  dayTitle: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  daySummary: { fontSize: 12.5, color: Colors.textLight, marginTop: 2 },
  card: { backgroundColor: 'white', borderRadius: 16, borderWidth: 1, borderColor: '#E9ECE4', padding: 12, marginBottom: 10 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 15, fontWeight: '800', color: Colors.brandNavy },
  meta: { fontSize: 12, color: Colors.textLight, marginTop: 2 },
  pairBox: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F0F2EC', gap: 6 },
  readingLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  readingLabel: { fontSize: 12.5, color: Colors.textLight, width: 92 },
  readingValue: { fontSize: 14, fontWeight: '800', color: Colors.brandNavy, flex: 1 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 11.5, fontWeight: '800' },
  rise: { fontSize: 12, color: Colors.textLight, marginLeft: 100 },
  nudge: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F4F3', borderRadius: 12, padding: 10 },
  nudgeText: { flex: 1, fontSize: 12.5, color: Colors.brandNavy, lineHeight: 17 },
  nudgeBtn: { backgroundColor: Colors.primary, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 7 },
  nudgeBtnText: { color: 'white', fontSize: 12, fontWeight: '900' },
  noReading: { fontSize: 12.5, color: Colors.textMuted },
  tip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: 'white', borderRadius: 14, borderWidth: 1, borderColor: '#E9ECE4', padding: 12, marginBottom: 6 },
  tipText: { flex: 1, fontSize: 13, color: Colors.brandNavy },
  tipLink: { fontSize: 13, fontWeight: '900', color: Colors.primary },
  empty: { alignItems: 'center', paddingHorizontal: 18, paddingTop: 40 },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#E8F4F3', alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 18, fontWeight: '900', color: Colors.brandNavy, textAlign: 'center', marginTop: 14 },
  emptyText: { fontSize: 13.5, color: Colors.textLight, textAlign: 'center', lineHeight: 20, marginTop: 6 },
  emptyActions: { flexDirection: 'row', gap: 10, marginTop: 18 },
  primaryBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, height: 46 },
  primaryBtnText: { color: 'white', fontWeight: '900', fontSize: 14 },
  secondaryBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', backgroundColor: 'white', borderWidth: 1, borderColor: Colors.primary, borderRadius: 12, paddingHorizontal: 16, height: 46 },
  secondaryBtnText: { color: Colors.primary, fontWeight: '900', fontSize: 14 },
  filterEmpty: { textAlign: 'center', color: Colors.textLight, marginTop: 40 },
  overlay: { flex: 1, backgroundColor: 'rgba(15,42,58,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: 'white', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: 18, maxHeight: '80%' },
  sheetHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  sheetTitle: { flex: 1, fontSize: 18, fontWeight: '900', color: Colors.brandNavy },
  sheetTime: { fontSize: 13, color: Colors.textLight, marginTop: 4, marginBottom: 10 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F2EC' },
  rowLabel: { fontSize: 13.5, color: Colors.textLight },
  rowValue: { fontSize: 13.5, fontWeight: '800', color: Colors.brandNavy, flexShrink: 1, textAlign: 'right' },
  deleteBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', marginTop: 18, height: 46, borderRadius: 12, backgroundColor: '#FFF5F5' },
  deleteText: { color: Colors.danger, fontWeight: '900', fontSize: 14 },
});
