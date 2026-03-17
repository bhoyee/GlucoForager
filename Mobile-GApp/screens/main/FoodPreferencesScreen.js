import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Modal,
  Pressable,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRoute } from '@react-navigation/native';
import { Colors } from '../../constants/Colors';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import { countries } from '../../utils/countries';
import { addDebugLog } from '../../utils/debugLogger';

const BLOOD_SUGAR_OPTIONS = [
  { value: 'type_2', label: 'Type 2 diabetes' },
  { value: 'prediabetes', label: 'Prediabetes' },
  { value: 'type_1', label: 'Type 1 diabetes' },
  { value: 'gestational', label: 'Gestational diabetes' },
  { value: 'managing', label: 'Managing blood sugar' },
  { value: 'prefer_not', label: 'Prefer not to say' },
];

const GOAL_OPTIONS = [
  { value: 'lower_carb', label: 'Lower carb' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'weight_loss', label: 'Weight loss friendly' },
  { value: 'quick_meals', label: 'Quick meals' },
  { value: 'simple_ingredients', label: 'Simple ingredients' },
  { value: 'budget_friendly', label: 'Budget friendly' },
  { value: 'family_friendly', label: 'Family friendly' },
];

const DIETARY_PATTERN_OPTIONS = [
  { value: 'none', label: 'None / No preference' },
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'pescatarian', label: 'Pescatarian' },
  { value: 'halal', label: 'Halal' },
  { value: 'kosher', label: 'Kosher' },
  { value: 'other', label: 'Other' },
];

const ALLERGEN_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'dairy', label: 'Dairy / lactose' },
  { value: 'eggs', label: 'Eggs' },
  { value: 'fish', label: 'Fish' },
  { value: 'shellfish', label: 'Shellfish' },
  { value: 'peanuts', label: 'Peanuts' },
  { value: 'tree_nuts', label: 'Tree nuts' },
  { value: 'soy', label: 'Soy' },
  { value: 'wheat_gluten', label: 'Wheat / gluten' },
  { value: 'sesame', label: 'Sesame' },
  { value: 'other', label: 'Other' },
];

const EXCLUSION_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: 'pork', label: 'Pork' },
  { value: 'beef', label: 'Beef' },
  { value: 'chicken', label: 'Chicken' },
  { value: 'seafood', label: 'Seafood' },
  { value: 'onion_garlic', label: 'Onion & garlic' },
  { value: 'spicy_food', label: 'Spicy food' },
  { value: 'mushrooms', label: 'Mushrooms' },
  { value: 'alcohol', label: 'Alcohol' },
  { value: 'caffeine', label: 'Caffeine' },
  { value: 'other', label: 'Other' },
];

const EQUIPMENT_OPTIONS = [
  { value: 'stove', label: 'Stove' },
  { value: 'oven', label: 'Oven' },
  { value: 'microwave', label: 'Microwave' },
  { value: 'air_fryer', label: 'Air fryer' },
  { value: 'blender', label: 'Blender' },
];

const COOK_TIME_OPTIONS = [
  { value: 'under_15', label: 'Under 15 minutes' },
  { value: '15_30', label: '15–30 minutes' },
  { value: '30_45', label: '30–45 minutes' },
  { value: 'any', label: 'Any time' },
];

const CUISINE_OPTIONS = [
  { value: 'west_african', label: 'West African' },
  { value: 'east_african', label: 'East African' },
  { value: 'mena', label: 'North African / Middle Eastern' },
  { value: 'british_irish', label: 'British / Irish' },
  { value: 'american_canadian', label: 'American / Canadian' },
  { value: 'caribbean', label: 'Caribbean' },
  { value: 'mediterranean', label: 'Mediterranean' },
  { value: 'south_asian', label: 'South Asian' },
  { value: 'east_asian', label: 'East Asian' },
  { value: 'southeast_asian', label: 'Southeast Asian' },
  { value: 'latin_american', label: 'Latin American' },
  { value: 'european', label: 'European' },
  { value: 'other', label: 'Other' },
];

const flagFromCode = (code) =>
  `${code || ''}`
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

const countryLabel = (item) => `${flagFromCode(item.code)} ${item.name} (${item.code})`;

function toggleInList(list, value) {
  const exists = list.includes(value);
  if (exists) return list.filter((x) => x !== value);
  return [...list, value];
}

function limitMultiSelect(list, value, max) {
  const exists = list.includes(value);
  if (exists) return list.filter((x) => x !== value);
  if (list.length >= max) return list;
  return [...list, value];
}

function mapLabel(options, value) {
  return options.find((x) => x.value === value)?.label || '';
}

export default function FoodPreferencesScreen({ navigation }) {
  const route = useRoute();
  const forced = Boolean(route?.params?.forced);
  const insets = useSafeAreaInsets();
  const { signOut, completeFoodProfileOnboarding, applyFoodProfileFlags } = useAuth();
  const goalsMax = forced ? 2 : 3;

  const [step, setStep] = useState(-1);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCountries, setShowCountries] = useState(false);

  const [bloodSugarProfile, setBloodSugarProfile] = useState(null);
  const [goals, setGoals] = useState([]);
  const [dietaryPattern, setDietaryPattern] = useState('none');
  const [allergens, setAllergens] = useState([]);
  const [exclusions, setExclusions] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [cookTime, setCookTime] = useState('any');
  const [cuisines, setCuisines] = useState([]);
  const [country, setCountry] = useState(null);

  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 10, 16);

  const steps = useMemo(() => {
    const goalSubtitle = forced ? 'Pick up to 2.' : 'Pick up to 3.';
    return [
      { title: 'Your blood sugar profile', subtitle: 'This helps tailor suggestions.' },
      { title: 'Meal goals', subtitle: goalSubtitle },
      { title: 'Dietary pattern', subtitle: 'Optional.' },
      { title: 'Avoids', subtitle: 'Allergies and foods to avoid.' },
      { title: 'Cooking reality', subtitle: 'Equipment and time.' },
      { title: 'Cuisine + country', subtitle: 'Pick up to 3 cuisines.' },
    ];
  }, [forced]);

  useEffect(() => {
    addDebugLog({
      source: 'FoodPreferences',
      level: 'info',
      message: 'Onboarding opened',
      details: JSON.stringify({ forced }),
    });
  }, [forced]);

  const loadProfile = useCallback(async () => {
    try {
      setBusy(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (!response.ok) return;
      const data = await response.json();
      setBloodSugarProfile(data?.blood_sugar_profile || null);
      setGoals(Array.isArray(data?.meal_goals) ? data.meal_goals : []);
      setDietaryPattern(data?.dietary_pattern || 'none');
      setAllergens(Array.isArray(data?.allergens) ? data.allergens : []);
      setExclusions(Array.isArray(data?.food_exclusions) ? data.food_exclusions : []);
      setEquipment(Array.isArray(data?.available_equipment) ? data.available_equipment : []);
      setCookTime(data?.cook_time_preference || 'any');
      setCuisines(Array.isArray(data?.preferred_cuisines) ? data.preferred_cuisines : []);
      const code = data?.country_code;
      if (typeof code === 'string' && code.trim()) {
        const found = countries.find((c) => c.code.toUpperCase() === code.trim().toUpperCase());
        setCountry(found || null);
      }
    } finally {
      setBusy(false);
    }
  }, [signOut]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const saveProfile = async (markCompleted) => {
    setSaving(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in again.');
        return false;
      }
      const payload = {
        blood_sugar_profile: bloodSugarProfile,
        meal_goals: goals,
        dietary_pattern: dietaryPattern,
        allergens: allergens.includes('none') ? [] : allergens.filter((x) => x !== 'none'),
        food_exclusions: exclusions.includes('none') ? [] : exclusions.filter((x) => x !== 'none'),
        available_equipment: equipment,
        cook_time_preference: cookTime,
        preferred_cuisines: cuisines,
        country_code: country?.code || null,
      };
      if (markCompleted) payload.profile_completed = true;

      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
        { onUnauthorized: signOut }
      );
      if (!response.ok) {
        Alert.alert('Error', 'Unable to save preferences right now.');
        return false;
      }
      const updatedProfile = await response.json().catch(() => null);
      if (updatedProfile) {
        applyFoodProfileFlags(updatedProfile);
      } else {
        applyFoodProfileFlags({
          ...payload,
          profile_completed: markCompleted ? true : undefined,
        });
      }
      if (markCompleted) {
        await completeFoodProfileOnboarding();
        addDebugLog({
          source: 'FoodPreferences',
          level: 'info',
          message: 'Onboarding completed',
          details: JSON.stringify({ forced }),
        });
      }
      return true;
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    addDebugLog({
      source: 'FoodPreferences',
      level: 'info',
      message: 'Onboarding skipped',
      details: JSON.stringify({ forced }),
    });
    const ok = await saveProfile(true);
    if (!ok) return;
    if (forced) {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      return;
    }
    navigation.goBack();
  };

  const handleNext = async () => {
    if (step < steps.length - 1) {
      setStep((s) => Math.min(steps.length - 1, s + 1));
      return;
    }
    const ok = await saveProfile(true);
    if (!ok) return;
    if (forced) {
      navigation.reset({ index: 0, routes: [{ name: 'MainTabs' }] });
      return;
    }
    navigation.goBack();
  };

  const handleBack = () => {
    if (step <= -1) {
      if (forced) {
        Alert.alert('Almost there', 'You can skip for now, or continue to finish setup.');
        return;
      }
      navigation.goBack();
      return;
    }
    setStep((s) => Math.max(0, s - 1));
  };

  const StepHeader = () => {
    const progress = Math.max(0, Math.min(1, (step + 1) / steps.length));
    return (
      <View style={styles.stepHeader}>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
        <Text style={styles.stepKicker}>
          Step {step + 1} of {steps.length}
        </Text>
        <Text style={styles.stepTitle}>{steps[step].title}</Text>
        <Text style={styles.stepSubtitle}>{steps[step].subtitle}</Text>
      </View>
    );
  };

  const Chip = ({ label, selected, onPress, disabled }) => (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, selected ? styles.chipSelected : null, disabled ? { opacity: 0.45 } : null]}
    >
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity style={styles.headerButton} onPress={handleBack}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Food preferences</Text>
          <Text style={styles.headerSubtitle}>Personalize your meals in ~30 seconds.</Text>
        </View>
        {forced ? (
          <TouchableOpacity style={styles.headerButton} onPress={handleSkip} disabled={saving}>
            <Text style={[styles.skipText, saving ? { opacity: 0.6 } : null]}>Skip</Text>
          </TouchableOpacity>
        ) : (
          <View style={{ width: 56 }} />
        )}
      </View>

      {busy ? (
        <View style={styles.loading}>
          <ActivityIndicator size="small" color={Colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: contentBottomPadding }]}>
          {step >= 0 ? <StepHeader /> : null}

          {step === -1 ? (
            <View style={styles.card}>
              <Text style={[styles.stepTitle, { marginTop: 0 }]}>Personalize your meals</Text>
              <Text style={styles.stepSubtitle}>
                Takes about 30 seconds. You can change this anytime in Profile.
              </Text>
              <View style={{ height: 14 }} />
              <TouchableOpacity
                style={[styles.primaryButton, saving ? { opacity: 0.7 } : null]}
                onPress={() => setStep(0)}
                disabled={saving}
              >
                <Text style={styles.primaryButtonText}>Start</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.secondaryButton} onPress={handleSkip} disabled={saving}>
                <Text style={styles.secondaryButtonText}>Skip for now</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {step === 0 ? (
            <View style={styles.card}>
              {BLOOD_SUGAR_OPTIONS.map((opt) => (
                <Chip
                  key={opt.value}
                  label={opt.label}
                  selected={bloodSugarProfile === opt.value}
                  onPress={() => setBloodSugarProfile(opt.value)}
                />
              ))}
            </View>
          ) : null}

          {step === 1 ? (
            <View style={styles.card}>
              <Text style={styles.helper}>Selected: {goals.length}/{goalsMax}</Text>
              <View style={styles.chipWrap}>
                {GOAL_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={goals.includes(opt.value)}
                    disabled={!goals.includes(opt.value) && goals.length >= goalsMax}
                    onPress={() => setGoals((prev) => limitMultiSelect(prev, opt.value, goalsMax))}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.card}>
              <View style={styles.chipWrap}>
                {DIETARY_PATTERN_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={dietaryPattern === opt.value}
                    onPress={() => setDietaryPattern(opt.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Allergies / intolerances</Text>
              <View style={styles.chipWrap}>
                {ALLERGEN_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={allergens.includes(opt.value)}
                    onPress={() => {
                      setAllergens((prev) => {
                        if (opt.value === 'none') return [];
                        const withoutNone = prev.filter((x) => x !== 'none');
                        return toggleInList(withoutNone, opt.value);
                      });
                    }}
                  />
                ))}
              </View>

              <View style={{ height: 14 }} />
              <View style={styles.divider} />
              <View style={{ height: 14 }} />
              <Text style={styles.sectionTitle}>Foods to avoid</Text>
              <View style={styles.chipWrap}>
                {EXCLUSION_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={exclusions.includes(opt.value)}
                    onPress={() => {
                      setExclusions((prev) => {
                        if (opt.value === 'none') return [];
                        const withoutNone = prev.filter((x) => x !== 'none');
                        return toggleInList(withoutNone, opt.value);
                      });
                    }}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {step === 4 ? (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>Equipment</Text>
              <View style={styles.chipWrap}>
                {EQUIPMENT_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={equipment.includes(opt.value)}
                    onPress={() => setEquipment((prev) => toggleInList(prev, opt.value))}
                  />
                ))}
              </View>

              <View style={{ height: 14 }} />
              <Text style={styles.sectionTitle}>Cooking time</Text>
              <View style={styles.chipWrap}>
                {COOK_TIME_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={cookTime === opt.value}
                    onPress={() => setCookTime(opt.value)}
                  />
                ))}
              </View>
            </View>
          ) : null}

          {step === 5 ? (
            <View style={styles.card}>
              <Text style={styles.helper}>Cuisines selected: {cuisines.length}/3</Text>
              <View style={styles.chipWrap}>
                {CUISINE_OPTIONS.map((opt) => (
                  <Chip
                    key={opt.value}
                    label={opt.label}
                    selected={cuisines.includes(opt.value)}
                    disabled={!cuisines.includes(opt.value) && cuisines.length >= 3}
                    onPress={() => setCuisines((prev) => limitMultiSelect(prev, opt.value, 3))}
                  />
                ))}
              </View>

              <View style={{ height: 14 }} />
              <Text style={styles.sectionTitle}>Country (optional)</Text>
              <TouchableOpacity style={styles.select} onPress={() => setShowCountries(true)}>
                <Text style={styles.selectText}>{country ? countryLabel(country) : 'Select country'}</Text>
                <Ionicons name="chevron-down" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            </View>
          ) : null}

          {step >= 0 ? (
            <View style={styles.footer}>
              <TouchableOpacity
                style={[styles.primaryButton, saving ? { opacity: 0.7 } : null]}
                onPress={handleNext}
                disabled={saving}
              >
                {saving ? <ActivityIndicator size="small" color="white" /> : null}
                <Text style={styles.primaryButtonText}>{step === steps.length - 1 ? 'Finish' : 'Next'}</Text>
              </TouchableOpacity>
              {!forced ? (
                <TouchableOpacity
                  style={styles.secondaryButton}
                  onPress={() => saveProfile(false)}
                  disabled={saving}
                >
                  <Text style={styles.secondaryButtonText}>Save</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      )}

      <Modal transparent visible={showCountries} animationType="fade" onRequestClose={() => setShowCountries(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowCountries(false)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select country</Text>
              <TouchableOpacity onPress={() => setShowCountries(false)}>
                <Ionicons name="close" size={22} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 420 }}>
              {countries.map((item) => (
                <TouchableOpacity
                  key={item.code}
                  style={styles.modalRow}
                  onPress={() => {
                    setCountry(item);
                    setShowCountries(false);
                  }}
                >
                  <Text style={styles.modalRowText}>{countryLabel(item)}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.modalRow, { borderBottomWidth: 0 }]}
                onPress={() => {
                  setCountry(null);
                  setShowCountries(false);
                }}
              >
                <Text style={[styles.modalRowText, { color: Colors.textLight }]}>Clear selection</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 10,
  },
  headerButton: { width: 56, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 19, fontWeight: '800', color: Colors.text },
  headerSubtitle: { marginTop: 2, fontSize: 12, color: Colors.textLight },
  skipText: { fontWeight: '700', color: Colors.primary },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  loadingText: { color: Colors.textLight },
  content: { paddingHorizontal: 16, paddingTop: 6 },
  stepHeader: { marginTop: 6, marginBottom: 14 },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#E9EEF5',
    overflow: 'hidden',
    marginBottom: 10,
  },
  progressFill: { height: 6, borderRadius: 999, backgroundColor: Colors.primary },
  stepKicker: { color: Colors.textLight, fontSize: 12, fontWeight: '600' },
  stepTitle: { marginTop: 6, fontSize: 22, fontWeight: '800', color: Colors.text },
  stepSubtitle: { marginTop: 6, color: Colors.textLight, lineHeight: 18 },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.06,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
      },
      android: { elevation: 2 },
    }),
  },
  divider: { height: 1, backgroundColor: '#EEF1F5' },
  helper: { color: Colors.textLight, fontSize: 12, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: Colors.text, marginBottom: 8 },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#F2F4F7',
    marginBottom: 8,
  },
  chipSelected: { backgroundColor: Colors.primary },
  chipText: { color: Colors.text, fontWeight: '600', fontSize: 13 },
  chipTextSelected: { color: 'white' },
  select: {
    marginTop: 6,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F2F4F7',
  },
  selectText: { color: Colors.text, fontWeight: '600' },
  footer: { marginTop: 16, gap: 10 },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  primaryButtonText: { color: 'white', fontWeight: '800' },
  secondaryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F4F7',
  },
  secondaryButtonText: { color: Colors.text, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', padding: 18 },
  modalCard: { backgroundColor: 'white', borderRadius: 16, padding: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  modalRow: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  modalRowText: { color: Colors.text, fontWeight: '600' },
});

