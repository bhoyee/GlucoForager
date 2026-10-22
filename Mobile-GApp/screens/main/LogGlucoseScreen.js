import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { cancelAfterMealCheck } from '../../utils/afterMealCheck';
import { DEFAULT_TARGETS, classifyReading, statusMeta } from '../../utils/glucose';
import { API_URL } from '../../config/api';
import { trackEvent } from '../../utils/analytics';
import TimeAgoSelector, { TIME_AGO_OPTIONS, loggedAtFromMinutesAgo } from '../../components/TimeAgoSelector';
import { generateIdempotencyKey } from '../../utils/idempotency';

const UNIT_PREF_KEY = 'glucose_unit_pref_v1';
const MGDL_PER_MMOL = 18.0182;
const MGDL_RANGE = { min: 20, max: 600 };
const MMOL_RANGE = { min: 1.1, max: 33.3 };

const CONTEXTS = [
  { key: 'fasting', label: 'Fasting', hint: 'On waking', icon: 'sunny', color: '#D97706', bg: '#FFF4E0' },
  { key: 'before_meal', label: 'Before meal', hint: 'Up to 1h before', icon: 'restaurant-outline', color: '#2C8632', bg: '#E9F6EA' },
  { key: 'after_meal', label: 'After meal', hint: '1-2h after eating', icon: 'restaurant', color: '#6B46C1', bg: '#F0EBFB' },
  { key: 'bedtime', label: 'Bedtime', hint: 'Before sleep', icon: 'moon', color: '#2B6CB0', bg: '#E6F0FB' },
];
const BLUE = '#2B6CB0';
const TEAL = '#1D7C7A';
const VIOLET = '#6B46C1';

// Rotating pools instead of one fixed line each, so the post-log message doesn't feel
// like the same canned popup every time - especially the in-range case, which fires
// on most logs and needs to read as genuine encouragement rather than a repeated toast.
const NORMAL_MESSAGES = [
  'Nice, right in range.',
  'Good control - keep it up.',
  "That's a solid reading.",
  'Right where you want it to be.',
  'Steady as it goes - nice work.',
  'In range. Small consistent wins add up.',
];

const LOW_MESSAGES = [
  "This reading is on the low side. If you're feeling unwell, treat it the way you normally would.",
  'A bit low - listen to your body and treat it if you need to.',
  'On the lower end. If symptoms show up, go ahead and treat as usual.',
  'Low side today. Keep an eye on how you feel over the next little while.',
  "That's below your usual range - treat it the way you normally would if needed.",
];

const HIGH_MESSAGES = [
  'This reading is quite high on its own, whether or not it followed a meal - worth keeping an eye on.',
  "That's on the higher side. Worth noting what led up to it.",
  'A high one - if this keeps happening, it might be worth flagging to your care team.',
  'Higher than your usual range. No need to panic - just something to watch.',
  "That's elevated. Keep tabs on how it trends over the next few readings.",
];

const spikeMessages = (mealDescription) => [
  `This is higher than usual, and follows "${mealDescription}" - worth keeping an eye on if it happens again.`,
  `Bit of a jump after "${mealDescription}". One reading isn't a pattern, but worth watching.`,
  `This one's elevated following "${mealDescription}". If it repeats, that meal might be worth adjusting.`,
  `Higher than expected after "${mealDescription}" - good to know for next time.`,
];

function pickRandom(pool) {
  return pool[Math.floor(Math.random() * pool.length)];
}

export default function LogGlucoseScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [unit, setUnit] = useState('mg/dL');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  // The meal diary's 'Log glucose' nudge opens this pre-tagged as an after-meal reading.
  const [context, setContext] = useState(route.params?.context || null);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [targets, setTargets] = useState(DEFAULT_TARGETS);
  // Stays the same across a retry of this exact attempt (e.g. a timeout the user
  // responds to by tapping Log reading again), but regenerates whenever the actual
  // entry changes - so a real second reading is never mistaken for a retry.
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);

  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey());
  }, [value, unit, note, context, minutesAgo]);

  // The user's own targets, for the live "On target" preview while typing.
  useEffect(() => {
    (async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;
        const res = await apiFetch(
          `${API_URL}/api/app/health-log/glucose-targets`,
          { headers: { Authorization: `Bearer ${token}` } },
          { timeoutMs: 8000 }
        );
        if (res.ok) setTargets({ ...DEFAULT_TARGETS, ...(await res.json()) });
      } catch {
        // Defaults are fine for a preview.
      }
    })();
  }, []);

  useEffect(() => {
    AsyncStorage.getItem(UNIT_PREF_KEY)
      .then((stored) => {
        if (stored === 'mg/dL' || stored === 'mmol/L') setUnit(stored);
      })
      .catch(() => {});
  }, []);

  const switchUnit = (nextUnit) => {
    if (nextUnit === unit) return;
    setUnit(nextUnit);
    setValue('');
    AsyncStorage.setItem(UNIT_PREF_KEY, nextUnit).catch(() => {});
  };

  const handleValueChange = (text) => {
    if (unit === 'mmol/L') {
      let cleaned = text.replace(/[^0-9.]/g, '');
      const firstDot = cleaned.indexOf('.');
      if (firstDot !== -1) {
        cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '');
      }
      setValue(cleaned);
    } else {
      setValue(text.replace(/[^0-9]/g, ''));
    }
  };

  const handleSave = async () => {
    const raw = parseFloat(value);
    const range = unit === 'mmol/L' ? MMOL_RANGE : MGDL_RANGE;
    if (!Number.isFinite(raw) || raw < range.min || raw > range.max) {
      Alert.alert(
        'Check the reading',
        `Enter your glucose reading in ${unit} (between ${range.min} and ${range.max}).`
      );
      return;
    }
    if (isSaving) return;
    setIsSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to log a reading.');
        return;
      }
      const valueMgDl = unit === 'mmol/L' ? Math.round(raw * MGDL_PER_MMOL) : Math.round(raw);
      const response = await apiFetch(
        `${API_URL}/api/app/glucose`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            value_mg_dl: valueMgDl,
            note: note.trim() || undefined,
            context: context || undefined,
            logged_at: loggedAtFromMinutesAgo(minutesAgo),
            idempotency_key: idempotencyKey,
          }),
        },
        { timeoutMs: 8000 }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Unable to log reading', data?.detail?.message || data?.detail || 'Please try again.');
        return;
      }
      const data = await response.json();
      if (context !== 'fasting' && context !== 'before_meal') cancelAfterMealCheck();
      // The actual reading value is never sent - only that a reading was logged,
      // and whether it was flagged as a spike (a state, not a health value).
      trackEvent('glucose_logged', {
        unit,
        is_spike: Boolean(data?.is_spike),
        context: context || 'none',
        general_alert: data?.general_alert || 'none',
        minutes_ago: minutesAgo,
        duplicate: Boolean(data?.duplicate),
      });
      if (data?.duplicate) {
        // Backend recognized this as the same value/context you just logged seconds
        // ago (a double-tap or retry) and returned that existing entry rather than
        // creating a second one - nothing new to alert on, just move on.
        navigation.goBack();
        return;
      }
      // After saving, offer insights: the moment people are curious how they're doing.
      const cameFromInsights = navigation.getState()?.routes?.some((r) => r.name === 'GlucoseInsights');
      const done = (message, tab = 'trends') =>
        Alert.alert('Reading logged', message, [
          {
            text: 'See insights',
            onPress: () => (cameFromInsights ? navigation.goBack() : navigation.replace('GlucoseInsights', { tab })),
          },
          { text: 'Got it', onPress: () => navigation.goBack() },
        ]);
      if (data?.is_spike && data?.flagged_meal) {
        done(pickRandom(spikeMessages(data.flagged_meal.description)));
        return;
      }
      if (data?.general_alert === 'low' || data?.general_alert === 'high') {
        done(pickRandom(data.general_alert === 'low' ? LOW_MESSAGES : HIGH_MESSAGES));
        return;
      }
      // A reading 30 min - 3 h after a logged meal: tell them how that meal did.
      if (data?.paired_meal && data?.after_meal_result) {
        const result = data.after_meal_result;
        const outcome =
          result.status === 'in_range'
            ? 'was on target'
            : result.status === 'below' || result.status === 'low'
              ? 'was below target'
              : 'was above target';
        done(`Your reading after "${data.paired_meal.description}" ${outcome}. It's now in your meal diary and food impact.`, 'food');
        return;
      }
      done(pickRandom(NORMAL_MESSAGES));
    } catch {
      Alert.alert('Unable to log reading', 'Network request failed. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  // Live preview of how this reading compares with the user's targets.
  const parsed = parseFloat(value);
  const range = unit === 'mmol/L' ? MMOL_RANGE : MGDL_RANGE;
  const validValue = Number.isFinite(parsed) && parsed >= range.min && parsed <= range.max;
  const previewMgDl = validValue ? (unit === 'mmol/L' ? parsed * MGDL_PER_MMOL : parsed) : null;
  const preview = previewMgDl != null ? classifyReading(previewMgDl, context, targets) : null;
  const previewMeta = preview ? statusMeta(preview.status) : null;
  const previewText = (() => {
    if (!preview) return '';
    if (preview.status === 'in_range') return 'On target';
    if (preview.status === 'low') return 'Low';
    if (preview.status === 'very_high') return 'Very high';
    const d = unit === 'mmol/L' ? (preview.delta_mg_dl / MGDL_PER_MMOL).toFixed(1) : Math.round(preview.delta_mg_dl);
    return `${d} ${preview.status} target`;
  })();

  return (
    <View style={styles.container}>
      <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Ionicons name="arrow-back" size={22} color="white" />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.headerTitle}>Log glucose</Text>
            <Text style={styles.headerSubtitle}>
              {minutesAgo === 0
                ? 'Logged as right now'
                : `Logged as ${TIME_AGO_OPTIONS.find((o) => o.minutesAgo === minutesAgo)?.label}`}
            </Text>
          </View>
          <View style={{ width: 44 }} />
        </View>
      </View>
      <ScrollView
        contentContainerStyle={{ paddingTop: 28 }}
        style={{ marginTop: -28 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

        <View style={styles.content}>
          <View style={styles.card}>
            <View style={styles.cardHeadRow}>
              <SectionHead icon="water" color={BLUE} title="Your reading" />
              <View style={styles.unitSwitcher}>
                {['mg/dL', 'mmol/L'].map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitOption, unit === u && styles.unitOptionActive]}
                    onPress={() => switchUnit(u)}
                  >
                    <Text style={[styles.unitOptionText, unit === u && styles.unitOptionTextActive]}>{u}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={[styles.valueBox, previewMeta && { borderColor: previewMeta.color }]}>
              <TextInput
                style={styles.valueInput}
                placeholder={unit === 'mmol/L' ? '7.9' : '142'}
                placeholderTextColor="#C5CCD3"
                value={value}
                onChangeText={handleValueChange}
                keyboardType="decimal-pad"
                maxLength={unit === 'mmol/L' ? 5 : 3}
                autoFocus
              />
              <Text style={styles.valueUnit}>{unit}</Text>
            </View>
            {preview ? (
              <View style={[styles.previewPill, { backgroundColor: `${previewMeta.color}1A` }]}>
                <Ionicons
                  name={preview.status === 'in_range' ? 'checkmark-circle' : 'alert-circle'}
                  size={16}
                  color={previewMeta.color}
                />
                <Text style={[styles.previewText, { color: previewMeta.color }]}>
                  {previewText}
                  {context ? '' : ' · general range'}
                </Text>
              </View>
            ) : (
              <Text style={styles.valueHint}>Type the number from your meter</Text>
            )}
          </View>

          <View style={styles.card}>
            <SectionHead icon="time" color={TEAL} title="When was it taken?" subtitle="Helps compare it with the right target" />
            <View style={styles.contextGrid}>
              {CONTEXTS.map((c) => {
                const selected = context === c.key;
                return (
                  <TouchableOpacity
                    key={c.key}
                    style={[
                      styles.contextTile,
                      { backgroundColor: selected ? c.color : c.bg, borderColor: selected ? c.color : 'transparent' },
                    ]}
                    onPress={() => setContext(selected ? null : c.key)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.contextIcon, { backgroundColor: selected ? 'rgba(255,255,255,0.22)' : 'white' }]}>
                      <Ionicons name={c.icon} size={16} color={selected ? 'white' : c.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.contextLabel, { color: selected ? 'white' : Colors.brandNavy }]} numberOfLines={1}>
                        {c.label}
                      </Text>
                      <Text style={[styles.contextHint, { color: selected ? 'rgba(255,255,255,0.85)' : c.color }]} numberOfLines={1}>
                        {c.hint}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.rowLabel}>How long ago?</Text>
            <TimeAgoSelector value={minutesAgo} onChange={setMinutesAgo} />
          </View>

          <View style={styles.card}>
            <SectionHead icon="create" color={VIOLET} title="Note" subtitle="Optional" />
            <TextInput
              style={styles.noteInput}
              placeholder="e.g. Felt shaky, after a walk"
              placeholderTextColor={Colors.textMuted}
              value={note}
              onChangeText={setNote}
              multiline
            />
          </View>

          <TouchableOpacity onPress={handleSave} disabled={isSaving} activeOpacity={0.9} style={styles.saveShadow}>
            <LinearGradient
              colors={['#23807E', '#0B5A46']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            >
              {isSaving ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="checkmark-circle" size={20} color="white" />
                  <Text style={styles.saveButtonText}>Log reading{validValue ? ` · ${value} ${unit}` : ''}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <TouchableOpacity style={styles.trendsLink} onPress={() => navigation.navigate('GlucoseInsights')} hitSlop={8}>
            <Ionicons name="trending-up" size={15} color={Colors.primary} />
            <Text style={styles.trendsLinkText}>See your glucose insights</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

// Card heading: coloured icon badge, title and a one-line explanation.
function SectionHead({ icon, color, title, subtitle }) {
  return (
    <View style={styles.sectionHead}>
      <View style={[styles.sectionIcon, { backgroundColor: color }]}>
        <Ionicons name={icon} size={16} color="white" />
      </View>
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  headerPanel: {
    zIndex: 10, elevation: 5,
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
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
  headerTitle: { fontSize: 20, fontWeight: '900', color: 'white' },
  headerSubtitle: { marginTop: 3, fontSize: 12, color: 'rgba(255,255,255,0.78)', fontWeight: '700' },
  content: { padding: 16, gap: 12 },
  card: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF0EA',
    shadowColor: '#0F2A3A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardHeadRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12, flexShrink: 1 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15.5, fontWeight: '900', color: Colors.brandNavy },
  sectionSubtitle: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  unitSwitcher: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 999, padding: 3 },
  unitOption: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999 },
  unitOptionActive: { backgroundColor: BLUE },
  unitOptionText: { fontSize: 12, fontWeight: '800', color: Colors.textLight },
  unitOptionTextActive: { color: 'white' },
  valueBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: '#E3EAF2',
    backgroundColor: '#F6F9FC',
    paddingVertical: 10,
  },
  valueInput: { minWidth: 110, fontSize: 46, fontWeight: '900', color: Colors.brandNavy, textAlign: 'center', paddingVertical: 4 },
  valueUnit: { fontSize: 16, fontWeight: '800', color: Colors.textLight },
  valueHint: { fontSize: 12.5, color: Colors.textLight, textAlign: 'center', marginTop: 10 },
  previewPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  previewText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  contextGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginBottom: 14 },
  contextTile: {
    width: '48.8%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  contextIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  contextLabel: { fontSize: 13.5, fontWeight: '900' },
  contextHint: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  rowLabel: { fontSize: 11.5, fontWeight: '800', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  noteInput: {
    minHeight: 64,
    backgroundColor: '#F7F8F5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E6EAE2',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  saveShadow: {
    borderRadius: 16,
    shadowColor: '#0B5A46',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  saveButton: { height: 54, borderRadius: 16, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: '900' },
  trendsLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8 },
  trendsLinkText: { fontSize: 14, fontWeight: '800', color: Colors.primary },
});
