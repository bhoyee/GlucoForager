import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { API_URL } from '../../config/api';
import { trackEvent } from '../../utils/analytics';
import TimeAgoSelector, { TIME_AGO_OPTIONS, loggedAtFromMinutesAgo } from '../../components/TimeAgoSelector';
import { generateIdempotencyKey } from '../../utils/idempotency';

const UNIT_PREF_KEY = 'glucose_unit_pref_v1';
const MGDL_PER_MMOL = 18.0182;
const MGDL_RANGE = { min: 20, max: 600 };
const MMOL_RANGE = { min: 1.1, max: 33.3 };

const CONTEXTS = [
  { key: 'fasting', label: 'Fasting', icon: 'sunny-outline', color: '#16A34A' },
  { key: 'before_meal', label: 'Before meal', icon: 'restaurant-outline', color: '#D97706' },
  { key: 'after_meal', label: 'After meal', icon: 'restaurant-outline', color: '#7C3AED' },
  { key: 'bedtime', label: 'Bedtime', icon: 'moon-outline', color: '#2563EB' },
];

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
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [unit, setUnit] = useState('mg/dL');
  const [value, setValue] = useState('');
  const [note, setNote] = useState('');
  const [context, setContext] = useState(null);
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  // Stays the same across a retry of this exact attempt (e.g. a timeout the user
  // responds to by tapping Log reading again), but regenerates whenever the actual
  // entry changes - so a real second reading is never mistaken for a retry.
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);

  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey());
  }, [value, unit, note, context, minutesAgo]);

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
      if (data?.is_spike && data?.flagged_meal) {
        Alert.alert(
          'Reading logged',
          pickRandom(spikeMessages(data.flagged_meal.description)),
          [{ text: 'Got it', onPress: () => navigation.goBack() }]
        );
        return;
      }
      if (data?.general_alert === 'low' || data?.general_alert === 'high') {
        Alert.alert(
          'Reading logged',
          pickRandom(data.general_alert === 'low' ? LOW_MESSAGES : HIGH_MESSAGES),
          [{ text: 'Got it', onPress: () => navigation.goBack() }]
        );
        return;
      }
      Alert.alert('Reading logged', pickRandom(NORMAL_MESSAGES), [
        { text: 'Got it', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Unable to log reading', 'Network request failed. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const spikeHint =
    unit === 'mmol/L'
      ? `${(180 / MGDL_PER_MMOL).toFixed(1)} mmol/L`
      : '180 mg/dL';

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
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

        <View style={styles.content}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Reading</Text>
            <View style={styles.unitSwitcher}>
              <TouchableOpacity
                style={[styles.unitOption, unit === 'mg/dL' && styles.unitOptionActive]}
                onPress={() => switchUnit('mg/dL')}
              >
                <Text style={[styles.unitOptionText, unit === 'mg/dL' && styles.unitOptionTextActive]}>mg/dL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.unitOption, unit === 'mmol/L' && styles.unitOptionActive]}
                onPress={() => switchUnit('mmol/L')}
              >
                <Text style={[styles.unitOptionText, unit === 'mmol/L' && styles.unitOptionTextActive]}>mmol/L</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={styles.valueInput}
            placeholder={unit === 'mmol/L' ? 'e.g. 7.9' : 'e.g. 142'}
            placeholderTextColor={Colors.textMuted}
            value={value}
            onChangeText={handleValueChange}
            keyboardType="decimal-pad"
            maxLength={unit === 'mmol/L' ? 5 : 3}
            autoFocus
          />

          <Text style={[styles.label, { marginTop: 20, marginBottom: 10 }]}>How long ago was this?</Text>
          <TimeAgoSelector value={minutesAgo} onChange={setMinutesAgo} />

          <Text style={[styles.label, { marginTop: 20, marginBottom: 10 }]}>Reading context (optional)</Text>
          <View style={styles.contextRow}>
            {CONTEXTS.map((c) => {
              const selected = context === c.key;
              return (
                <TouchableOpacity
                  key={c.key}
                  style={[
                    styles.contextChip,
                    { backgroundColor: selected ? c.color : `${c.color}18` },
                  ]}
                  onPress={() => setContext(selected ? null : c.key)}
                  activeOpacity={0.85}
                >
                  <Ionicons name={c.icon} size={14} color={selected ? 'white' : c.color} />
                  <Text style={[styles.contextChipText, { color: selected ? 'white' : c.color }]}>{c.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <Text style={[styles.label, { marginTop: 20 }]}>Note (optional)</Text>
          <TextInput
            style={styles.noteInput}
            placeholder="e.g. Before lunch, felt fine"
            placeholderTextColor={Colors.textMuted}
            value={note}
            onChangeText={setNote}
            multiline
          />

          <Text style={styles.hint}>
            If this follows a logged meal by 30 minutes to 3 hours and reads {spikeHint} or higher, we'll flag
            that meal so you can spot patterns over time.
          </Text>

          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSave}
            disabled={isSaving}
            activeOpacity={0.9}
          >
            <Text style={styles.saveButtonText}>{isSaving ? 'Logging...' : 'Log reading'}</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.trackCard}
            onPress={() => navigation.navigate('TrackRegularly')}
            activeOpacity={0.85}
          >
            <View style={styles.trackIcon}>
              <Ionicons name="trending-up" size={18} color={Colors.success} />
            </View>
            <View style={styles.trackTextBlock}>
              <Text style={styles.trackTitle}>Track regularly</Text>
              <Text style={styles.trackSubtitle}>
                See how your food, activity and habits affect your blood sugar over time.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={Colors.textMuted} />
          </TouchableOpacity>
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
  content: { padding: 20 },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  label: { fontSize: 15, fontWeight: '800', color: Colors.text },
  unitSwitcher: {
    flexDirection: 'row',
    backgroundColor: Colors.background,
    borderRadius: 999,
    padding: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  unitOption: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  unitOptionActive: { backgroundColor: Colors.primary },
  unitOptionText: { fontSize: 12, fontWeight: '800', color: Colors.textLight },
  unitOptionTextActive: { color: 'white' },
  valueInput: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
  },
  noteInput: {
    minHeight: 64,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  contextRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  contextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
  },
  contextChipText: { fontSize: 12.5, fontWeight: '800' },
  hint: { marginTop: 14, fontSize: 12, lineHeight: 18, color: Colors.textLight, fontWeight: '600' },
  saveButton: {
    marginTop: 24,
    height: 52,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: 'white', fontSize: 15, fontWeight: '800' },
  trackCard: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 16,
    backgroundColor: `${Colors.success}0F`,
    borderWidth: 1,
    borderColor: `${Colors.success}33`,
  },
  trackIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: `${Colors.success}1A`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trackTextBlock: { flex: 1, minWidth: 0 },
  trackTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.text },
  trackSubtitle: { marginTop: 2, fontSize: 12, lineHeight: 17, color: Colors.textLight, fontWeight: '600' },
});
