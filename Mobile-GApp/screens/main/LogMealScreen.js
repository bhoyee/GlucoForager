// screens/main/LogMealScreen.js
// Log a meal by typing it. While typing, the backend estimates the carbs and a standard
// food name (POST /app/meals/estimate), so typed meals count toward the carb ring and
// group properly in Food impact. Recent meals re-log in one tap. The estimate is
// optional: if it fails, the meal still saves without carbs.
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { apiFetch } from '../../utils/api';
import { confirmMealLogged } from '../../utils/mealLogConfirm';
import { API_URL } from '../../config/api';
import { trackEvent } from '../../utils/analytics';
import TimeAgoSelector, { TIME_AGO_OPTIONS, loggedAtFromMinutesAgo } from '../../components/TimeAgoSelector';
import { generateIdempotencyKey } from '../../utils/idempotency';

const PORTIONS = [
  { key: 'small', label: 'Small', factor: 0.7 },
  { key: 'regular', label: 'Regular', factor: 1 },
  { key: 'large', label: 'Large', factor: 1.4 },
];
const ESTIMATE_DELAY_MS = 900;
const TEAL = '#1D7C7A';
const GREEN = '#2C8632';
const BLUE = '#2B6CB0';
const CHIP_THEMES = {
  usual: { bg: '#E8F4F3', border: '#CDE7E4', accent: TEAL },
  recipe: { bg: '#E9F6EA', border: '#CBE9CD', accent: GREEN },
};
const WARN = { bg: '#FFF8E6', border: '#F6D9A0', text: '#B7791F', title: '#7B4A0B' };

const authHeaders = async () => {
  const token = await AsyncStorage.getItem('userToken');
  return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
};

export default function LogMealScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);

  const [description, setDescription] = useState('');
  const [minutesAgo, setMinutesAgo] = useState(0);
  const [isSaving, setIsSaving] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [recent, setRecent] = useState([]);
  const [recentLabel, setRecentLabel] = useState('recent');
  const [recipeOptions, setRecipeOptions] = useState([]);
  const [mealSource, setMealSource] = useState('manual'); // 'recipe' when picked from your recipes
  const [pickedKey, setPickedKey] = useState(null); // highlighted quick-pick chip
  const [inputFocused, setInputFocused] = useState(false);
  // estimate: { state: 'idle'|'loading'|'ready'|'unknown'|'failed', food_name, carbs_g, items }
  const [estimate, setEstimate] = useState({ state: 'idle' });
  const [portion, setPortion] = useState('regular');
  const [carbsOverride, setCarbsOverride] = useState(null); // string while the user edits
  const [editingCarbs, setEditingCarbs] = useState(false);
  const skipEstimateFor = useRef(null); // text filled from a recent meal: no new estimate needed
  const requestSeq = useRef(0);

  useEffect(() => {
    setIdempotencyKey(generateIdempotencyKey());
  }, [description, minutesAgo]);

  useEffect(() => {
    (async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const [recentRes, recipesRes] = await Promise.all([
          apiFetch(`${API_URL}/api/app/meals/recent?limit=6`, { headers }, { timeoutMs: 8000 }),
          apiFetch(`${API_URL}/api/app/meals/recipe-options?limit=8`, { headers }, { timeoutMs: 8000 }),
        ]);
        if (recentRes.ok) {
          const data = await recentRes.json();
          setRecent(data?.items || []);
          setRecentLabel(data?.label || 'recent');
        }
        if (recipesRes.ok) setRecipeOptions((await recipesRes.json())?.items || []);
      } catch {
        // Optional.
      }
    })();
  }, []);

  // Estimate carbs shortly after the person stops typing.
  useEffect(() => {
    const text = description.trim();
    if (skipEstimateFor.current === text) return undefined;
    skipEstimateFor.current = null;
    setMealSource('manual');
    setCarbsOverride(null);
    setEditingCarbs(false);
    setPortion('regular');
    if (text.length < 3 || !/[a-z]/i.test(text)) {
      setEstimate({ state: 'idle' });
      return undefined;
    }
    setEstimate({ state: 'loading' });
    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      try {
        const headers = await authHeaders();
        if (!headers) return;
        const res = await apiFetch(
          `${API_URL}/api/app/meals/estimate`,
          { method: 'POST', headers, body: JSON.stringify({ description: text }) },
          { timeoutMs: 15000 }
        );
        if (seq !== requestSeq.current) return; // the text changed meanwhile
        if (!res.ok) {
          setEstimate({ state: 'failed' });
          return;
        }
        const data = await res.json();
        setEstimate(data?.recognized ? { state: 'ready', ...data } : { state: 'unknown' });
      } catch {
        if (seq === requestSeq.current) setEstimate({ state: 'failed' });
      }
    }, ESTIMATE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [description]);

  const portionFactor = PORTIONS.find((p) => p.key === portion)?.factor || 1;
  const estimatedCarbs = estimate.state === 'ready' ? Math.round(estimate.carbs_g * portionFactor) : null;
  const typedCarbs = carbsOverride !== null && carbsOverride !== '' ? Number(carbsOverride.replace(',', '.')) : null;
  const finalCarbs = Number.isFinite(typedCarbs) ? Math.max(0, Math.round(typedCarbs)) : estimatedCarbs;
  const carbsAreEstimate = !Number.isFinite(typedCarbs) && estimatedCarbs != null;

  // A recipe the user has (favourite or recently generated): exact carbs per serving.
  const pickRecipe = (recipe) => {
    skipEstimateFor.current = recipe.title.trim();
    setDescription(recipe.title);
    setMealSource('recipe');
    setPortion('regular');
    setEditingCarbs(false);
    if (recipe.carbs_g != null) {
      setEstimate({ state: 'ready', food_name: recipe.title, carbs_g: recipe.carbs_g, items: [], fromRecipe: true });
      setCarbsOverride(String(Math.round(recipe.carbs_g)));
    } else {
      setEstimate({ state: 'idle' });
      setCarbsOverride(null);
    }
  };

  const pickRecent = (meal) => {
    skipEstimateFor.current = meal.description.trim();
    setMealSource(meal.source === 'recipe' ? 'recipe' : 'manual');
    setDescription(meal.description);
    setPortion('regular');
    setEditingCarbs(false);
    if (meal.carbs_g != null) {
      setEstimate({
        state: 'ready',
        food_name: meal.food_name,
        carbs_g: meal.carbs_g,
        items: [],
        fromRecent: true,
        wasEstimate: meal.carbs_estimated,
      });
      setCarbsOverride(meal.carbs_estimated ? null : String(Math.round(meal.carbs_g)));
    } else {
      setEstimate({ state: 'idle' });
      setCarbsOverride(null);
    }
  };

  const handleSave = async () => {
    const trimmed = description.trim();
    if (!trimmed) {
      Alert.alert('Add a description', 'Say what you ate, e.g. "Grilled chicken with rice and vegetables".');
      return;
    }
    setIsSaving(true);
    try {
      const headers = await authHeaders();
      if (!headers) {
        Alert.alert('Sign in required', 'Please sign in to log a meal.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/meals`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            description: trimmed,
            source: mealSource,
            logged_at: loggedAtFromMinutesAgo(minutesAgo),
            idempotency_key: idempotencyKey,
            ...(finalCarbs != null ? { carbs_g: finalCarbs } : {}),
            carbs_estimated: finalCarbs != null && (carbsAreEstimate || Boolean(estimate.wasEstimate && carbsOverride === null)),
            ...(estimate.state === 'ready' && estimate.food_name ? { food_name: estimate.food_name } : {}),
          }),
        },
        { timeoutMs: 8000 }
      );
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Unable to log meal', data?.detail?.message || data?.detail || 'Please try again.');
        return;
      }
      const data = await response.json().catch(() => ({}));
      // Description text itself is never sent - only that a meal was logged.
      trackEvent('meal_logged', {
        source: 'manual',
        minutes_ago: minutesAgo,
        duplicate: Boolean(data?.duplicate),
        has_carbs: finalCarbs != null,
        carbs_estimated: carbsAreEstimate,
        from_recent: Boolean(estimate.fromRecent),
        from_recipe: mealSource === 'recipe',
      });
      navigation.goBack();
      if (data?.duplicate) return;

      // Show what happens next: the carbs counted and when to check glucose.
      await confirmMealLogged({
        name: estimate.food_name || trimmed,
        description: data?.meal?.description || trimmed,
        loggedAt: data?.meal?.logged_at,
        carbs: finalCarbs,
        carbsEstimated: carbsAreEstimate,
      });
    } catch {
      Alert.alert('Unable to log meal', 'Network request failed. Please check your connection.');
    } finally {
      setIsSaving(false);
    }
  };

  const renderEstimate = () => {
    if (estimate.state === 'idle') return null;
    if (estimate.state === 'loading') {
      return (
        <View style={styles.estimateCard}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.estimateMuted}>Estimating carbs…</Text>
        </View>
      );
    }
    if (estimate.state === 'unknown' || estimate.state === 'failed') {
      return (
        <View style={styles.warnCard}>
          <View style={styles.warnHead}>
            <View style={styles.warnIcon}>
              <Ionicons name="alert-circle" size={18} color={WARN.text} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.warnTitle}>
                {estimate.state === 'unknown' ? "Couldn't estimate the carbs" : 'Carb estimate unavailable'}
              </Text>
              <Text style={styles.warnBody}>
                {estimate.state === 'unknown'
                  ? 'Try naming the food more clearly, or enter the carbs yourself. You can also log it without.'
                  : "Check your connection, or enter the carbs yourself. You can also log it without."}
              </Text>
            </View>
          </View>
          <Text style={styles.fieldLabel}>Carbs (optional)</Text>
          <CarbsInput value={carbsOverride ?? ''} onChange={setCarbsOverride} />
        </View>
      );
    }
    const itemsLine = (estimate.items || []).filter((i) => i.name).map((i) => i.name).join(', ');
    return (
      <View style={[styles.estimateCard, styles.estimateReady]}>
        <View style={styles.estimateIcon}>
          <Ionicons name="restaurant" size={18} color={Colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.estimateTop}>
            {editingCarbs ? null : (
              <Text style={styles.estimateCarbs}>
                {carbsAreEstimate ? 'About ' : ''}
                {finalCarbs}g carbs
              </Text>
            )}
            {carbsAreEstimate ? <Text style={styles.estimateTag}>estimate</Text> : null}
            <TouchableOpacity onPress={() => setEditingCarbs((v) => !v)} hitSlop={8} style={{ marginLeft: 'auto' }}>
              <Text style={styles.link}>{editingCarbs ? 'Done' : 'Edit'}</Text>
            </TouchableOpacity>
          </View>
          {editingCarbs ? (
            <View style={{ marginTop: 10 }}>
              <Text style={styles.fieldLabel}>Your carbs for this meal</Text>
              <CarbsInput value={carbsOverride ?? String(finalCarbs ?? '')} onChange={setCarbsOverride} autoFocus />
            </View>
          ) : null}
          <Text style={styles.estimateItems} numberOfLines={2}>
            {estimate.fromRecipe ? 'Per serving, from your recipe' : estimate.fromRecent ? 'Same as last time' : itemsLine || estimate.food_name}
          </Text>
          {!Number.isFinite(typedCarbs) ? (
            <View style={styles.portionRow}>
              <Text style={styles.portionLabel}>Portion</Text>
              {PORTIONS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  style={[styles.portionChip, portion === p.key && styles.portionChipActive]}
                  onPress={() => setPortion(p.key)}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.portionText, portion === p.key && styles.portionTextActive]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Log a meal</Text>
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
          {recent.length || recipeOptions.length ? (
            <View style={styles.card}>
              <SectionHead icon="flash" color={TEAL} title="Quick pick" subtitle="Tap a meal to fill it in" />
              {recent.length ? (
                <>
                  <Text style={styles.rowLabel}>{recentLabel === 'usual' ? 'Your usual meals' : 'Recent meals'}</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {recent.map((meal) => {
                      const key = `meal-${meal.id}`;
                      return (
                        <QuickChip
                          key={key}
                          theme={CHIP_THEMES.usual}
                          icon={recentLabel === 'usual' ? 'repeat' : 'time-outline'}
                          name={meal.food_name || meal.description}
                          carbs={meal.carbs_g}
                          approx={meal.carbs_estimated}
                          selected={pickedKey === key}
                          onPress={() => {
                            setPickedKey(key);
                            pickRecent(meal);
                          }}
                        />
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}
              {recipeOptions.length ? (
                <>
                  <Text style={[styles.rowLabel, recent.length ? { marginTop: 14 } : null]}>From your recipes</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {recipeOptions.map((recipe) => {
                      const key = `recipe-${recipe.title}`;
                      return (
                        <QuickChip
                          key={key}
                          theme={CHIP_THEMES.recipe}
                          icon={recipe.origin === 'favorite' ? 'bookmark' : 'book'}
                          name={recipe.title}
                          carbs={recipe.carbs_g}
                          selected={pickedKey === key}
                          onPress={() => {
                            setPickedKey(key);
                            pickRecipe(recipe);
                          }}
                        />
                      );
                    })}
                  </ScrollView>
                </>
              ) : null}
            </View>
          ) : null}

          <View style={styles.card}>
            <SectionHead icon="restaurant" color={GREEN} title="What did you eat?" subtitle="We'll estimate the carbs for you" />
            <TextInput
              style={[styles.input, inputFocused && styles.inputFocused]}
              placeholder="e.g. Jollof rice and chicken"
              placeholderTextColor={Colors.textMuted}
              value={description}
              onChangeText={(t) => {
                setPickedKey(null);
                setDescription(t);
              }}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              multiline
              autoFocus={!recent.length && !recipeOptions.length}
            />
            {renderEstimate()}
          </View>

          <View style={styles.card}>
            <SectionHead icon="time" color={BLUE} title="When did you eat it?" subtitle="So we can match it to your next glucose reading" />
            <TimeAgoSelector value={minutesAgo} onChange={setMinutesAgo} />
          </View>

          <View style={styles.tipRow}>
            <Ionicons name="water" size={15} color={BLUE} />
            <Text style={styles.tipText}>Check your glucose about 2 hours after eating to see how this meal affects you.</Text>
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
                  <Text style={styles.saveButtonText}>
                    Log meal{finalCarbs != null ? ` · ${carbsAreEstimate ? '~' : ''}${finalCarbs}g carbs` : ''}
                  </Text>
                </>
              )}
            </LinearGradient>
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
      <View style={{ flex: 1 }}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

// Quick-pick meal chip: tinted pill, icon, name and a solid carbs badge.
function QuickChip({ theme, icon, name, carbs, approx, selected, onPress }) {
  return (
    <TouchableOpacity
      style={[
        styles.chip,
        { backgroundColor: theme.bg, borderColor: selected ? theme.accent : theme.border },
        selected && styles.chipSelected,
      ]}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <Ionicons name={selected ? 'checkmark-circle' : icon} size={15} color={theme.accent} />
      <Text style={styles.chipName} numberOfLines={1}>
        {name}
      </Text>
      {carbs != null ? (
        <View style={[styles.chipBadge, { backgroundColor: theme.accent }]}>
          <Text style={styles.chipBadgeText}>
            {approx ? '~' : ''}
            {Math.round(carbs)}g
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

// Full-width number field with the unit inside it, so it's easy to tap and read.
function CarbsInput({ value, onChange, autoFocus }) {
  return (
    <View style={styles.carbsField}>
      <TextInput
        style={styles.carbsInput}
        value={value}
        onChangeText={(t) => onChange(t.replace(/[^0-9.,]/g, ''))}
        keyboardType="decimal-pad"
        placeholder="e.g. 45"
        placeholderTextColor={Colors.textMuted}
        autoFocus={autoFocus}
        maxLength={5}
      />
      <Text style={styles.carbsUnit}>g carbs</Text>
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
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  sectionIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15.5, fontWeight: '900', color: Colors.brandNavy },
  sectionSubtitle: { fontSize: 12, color: Colors.textLight, marginTop: 1 },
  rowLabel: { fontSize: 11.5, fontWeight: '800', color: Colors.textLight, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 },
  chipRow: { gap: 8, paddingRight: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    maxWidth: 240,
    borderWidth: 1.5,
    borderRadius: 999,
    paddingLeft: 12,
    paddingRight: 6,
    paddingVertical: 6,
  },
  chipSelected: { borderWidth: 2 },
  chipName: { fontSize: 13.5, fontWeight: '800', color: Colors.brandNavy, flexShrink: 1 },
  chipBadge: { borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  chipBadgeText: { fontSize: 11.5, fontWeight: '900', color: 'white' },
  inputFocused: { borderColor: Colors.primary, backgroundColor: 'white' },
  tipRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  tipText: { flex: 1, fontSize: 12.5, color: Colors.textLight, lineHeight: 18 },
  saveShadow: {
    borderRadius: 16,
    shadowColor: '#0B5A46',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  input: {
    minHeight: 84,
    backgroundColor: '#F7F8F5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E6EAE2',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
    color: Colors.text,
    textAlignVertical: 'top',
  },
  estimateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    padding: 12,
    borderRadius: 14,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  estimateReady: { alignItems: 'flex-start', backgroundColor: '#F4FAF9', borderColor: '#CDE7E4' },
  estimateIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: '#E8F4F3', alignItems: 'center', justifyContent: 'center' },
  estimateTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  estimateCarbs: { fontSize: 17, fontWeight: '900', color: Colors.brandNavy },
  estimateTag: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.textLight,
    backgroundColor: '#EEF1EA',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  estimateItems: { fontSize: 12.5, color: Colors.textLight, marginTop: 3 },
  estimateMuted: { fontSize: 13, color: Colors.textLight, flexShrink: 1 },
  link: { fontSize: 13, fontWeight: '900', color: Colors.primary },
  portionRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10, flexWrap: 'wrap' },
  portionLabel: { fontSize: 12, fontWeight: '700', color: Colors.textLight, marginRight: 2 },
  portionChip: { paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: 'white', borderWidth: 1, borderColor: Colors.border },
  portionChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  portionText: { fontSize: 12.5, fontWeight: '800', color: Colors.brandNavy },
  portionTextActive: { color: 'white' },
  warnCard: { marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: WARN.bg, borderWidth: 1, borderColor: WARN.border },
  warnHead: { flexDirection: 'row', gap: 10 },
  warnIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: '#FDECC8', alignItems: 'center', justifyContent: 'center' },
  warnTitle: { fontSize: 14.5, fontWeight: '900', color: WARN.title },
  warnBody: { fontSize: 12.5, color: WARN.title, marginTop: 2, lineHeight: 18 },
  fieldLabel: { fontSize: 12.5, fontWeight: '800', color: Colors.brandNavy, marginTop: 12, marginBottom: 6 },
  carbsField: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 50,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: Colors.primary,
    backgroundColor: 'white',
    paddingHorizontal: 14,
  },
  carbsInput: { flex: 1, height: '100%', fontSize: 18, fontWeight: '800', color: Colors.brandNavy },
  carbsUnit: { fontSize: 14, fontWeight: '800', color: Colors.textLight, marginLeft: 8 },
  saveButton: {
    height: 54,
    borderRadius: 16,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: { opacity: 0.7 },
  saveButtonText: { color: 'white', fontSize: 16, fontWeight: '900' },
});
