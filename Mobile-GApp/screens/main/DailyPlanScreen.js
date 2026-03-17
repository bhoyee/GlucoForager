import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { Colors } from '../../constants/Colors';

function mealIcon(meal) {
  const key = String(meal || '').toLowerCase();
  if (key === 'breakfast') return 'sunny-outline';
  if (key === 'lunch') return 'restaurant-outline';
  if (key === 'dinner') return 'moon-outline';
  if (key === 'snack') return 'nutrition-outline';
  return 'calendar-outline';
}

function titleCase(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function MealCard({ meal, item }) {
  const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
  const steps = Array.isArray(item?.steps) ? item.steps : [];
  const minutes = Number.isFinite(Number(item?.time_minutes)) ? Number(item.time_minutes) : null;
  const nutrition = item?.nutrition_estimate && typeof item.nutrition_estimate === 'object' ? item.nutrition_estimate : null;
  const calories = typeof nutrition?.calories === 'string' ? nutrition.calories.trim() : '';
  const carbs = typeof nutrition?.carbs_g === 'string' ? nutrition.carbs_g.trim() : '';
  const protein = typeof nutrition?.protein_g === 'string' ? nutrition.protein_g.trim() : '';
  const fiber = typeof nutrition?.fiber_g === 'string' ? nutrition.fiber_g.trim() : '';

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealTopRow}>
        <View style={styles.mealTag}>
          <Ionicons name={mealIcon(meal)} size={16} color={Colors.primaryDark} />
          <Text style={styles.mealTagText}>{titleCase(meal || 'Meal')}</Text>
        </View>
        {minutes ? (
          <View style={styles.timeChip}>
            <Ionicons name="time-outline" size={14} color={Colors.textLight} />
            <Text style={styles.timeChipText}>{minutes}m</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.mealName}>{item?.title || item?.name || '—'}</Text>
      {typeof item?.description === 'string' && item.description.trim() ? (
        <Text style={styles.mealDescription}>{item.description.trim()}</Text>
      ) : null}
      {typeof item?.note === 'string' && item.note.trim() ? (
        <View style={styles.noteBox}>
          <Ionicons name="information-circle-outline" size={16} color={Colors.secondary} />
          <Text style={styles.noteText}>{item.note.trim()}</Text>
        </View>
      ) : null}

      {calories || carbs || protein || fiber ? (
        <View style={styles.sectionBoxNutrition}>
          <View style={styles.sectionBoxTitleRow}>
            <Ionicons name="pie-chart-outline" size={16} color={Colors.secondary} />
            <Text style={styles.sectionBoxTitle}>Nutrition estimate</Text>
          </View>
          <View style={styles.pillRow}>
            {calories ? (
              <View style={styles.pillNutrition}>
                <Text style={styles.pillNutritionText}>Calories {calories}</Text>
              </View>
            ) : null}
            {carbs ? (
              <View style={styles.pillNutrition}>
                <Text style={styles.pillNutritionText}>Carbs {carbs}</Text>
              </View>
            ) : null}
            {protein ? (
              <View style={styles.pillNutrition}>
                <Text style={styles.pillNutritionText}>Protein {protein}</Text>
              </View>
            ) : null}
            {fiber ? (
              <View style={styles.pillNutrition}>
                <Text style={styles.pillNutritionText}>Fiber {fiber}</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {ingredients.length ? (
        <View style={styles.sectionBox}>
          <View style={styles.sectionBoxTitleRow}>
            <Ionicons name="list-outline" size={16} color={Colors.textLight} />
            <Text style={styles.sectionBoxTitle}>Ingredients</Text>
          </View>
          <View style={styles.pillRow}>
            {ingredients.slice(0, 10).map((ing, idx) => (
              <View key={`${meal}-ing-${idx}`} style={styles.pill}>
                <Text style={styles.pillText}>{String(ing)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      {steps.length ? (
        <View style={styles.sectionBoxSteps}>
          <View style={styles.sectionBoxTitleRow}>
            <Ionicons name="checkmark-done-outline" size={16} color={Colors.primaryDark} />
            <Text style={styles.sectionBoxTitle}>Steps</Text>
          </View>
          {steps.slice(0, 8).map((step, idx) => (
            <Text key={`${meal}-step-${idx}`} style={styles.step}>
              {idx + 1}. {String(step)}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export default function DailyPlanScreen() {
  const insets = useSafeAreaInsets();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  const loadToday = useCallback(async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      setPlan(null);
      return;
    }
    setLoading(true);
    try {
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.DAILY_PLAN_TODAY}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 8000 }
      );
      if (response.status === 403) {
        setPlan(null);
        return;
      }
      if (!response.ok) return;
      const data = await response.json();
      setPlan(data?.plan || null);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        if (!active) return;
        await loadToday();
      };
      run();
      return () => {
        active = false;
      };
    }, [loadToday])
  );

  const generateToday = async ({ force } = {}) => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return;
    setGenerating(true);
    try {
      const shouldForce = force === true;
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.DAILY_PLAN_GENERATE}${shouldForce ? '?force=1' : ''}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 45000 }
      );
      if (response.status === 403) {
        Alert.alert('Premium required', 'Daily Meal Planner is available for Premium users.');
        return;
      }
      const data = await response.json();
      if (!response.ok) {
        Alert.alert('Could not generate plan', data?.detail || 'Please try again.');
        return;
      }
      setPlan(data?.plan || null);
    } finally {
      setGenerating(false);
    }
  };

  const meals = Array.isArray(plan?.meals) ? plan.meals : [];
  const planDateLabel = useMemo(() => {
    const raw = plan?.plan_date;
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    return 'Today';
  }, [plan?.plan_date]);
  const dailyNutrition =
    plan?.daily_nutrition_estimate && typeof plan.daily_nutrition_estimate === 'object'
      ? plan.daily_nutrition_estimate
      : null;
  void dailyNutrition;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerTitleRow}>
            <View style={styles.headerIcon}>
              <Ionicons name="calendar-outline" size={18} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Daily Meal Planner</Text>
              <Text style={styles.headerSubtitle}>A simple plan for steady blood sugar habits.</Text>
            </View>
          </View>
        </View>

        {meals.length ? (
          <View style={styles.headerActions}>
            <Pressable
              disabled={generating}
              onPress={() => generateToday({ force: true })}
              style={[styles.headerPrimaryButton, generating ? { opacity: 0.7 } : null]}
            >
              {generating ? (
                <ActivityIndicator size="small" color="white" />
              ) : (
                <Ionicons name="sparkles-outline" size={16} color="white" />
              )}
              <Text style={styles.headerPrimaryButtonText}>Regenerate</Text>
            </Pressable>
            <Pressable onPress={loadToday} style={styles.headerSecondaryButton}>
              <Ionicons name="refresh-outline" size={16} color={Colors.text} />
              <Text style={styles.headerSecondaryButtonText}>Refresh</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>Loading your daily plan…</Text>
          </View>
        ) : meals.length ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.summaryTopRow}>
                <View style={styles.dateChip}>
                  <Ionicons name="calendar-clear-outline" size={14} color={Colors.primaryDark} />
                  <Text style={styles.dateChipText}>{planDateLabel}</Text>
                </View>
                <View style={styles.premiumChip}>
                  <Ionicons name="diamond-outline" size={14} color={Colors.accent} />
                  <Text style={styles.premiumChipText}>Premium</Text>
                </View>
              </View>
              {typeof plan?.summary === 'string' && plan.summary.trim() ? (
                <Text style={styles.summaryText}>{plan.summary.trim()}</Text>
              ) : (
                <Text style={styles.summaryText}>
                  Focus on protein + vegetables first, keep carbs moderate, and stay hydrated.
                </Text>
              )}

              {null}
            </View>

            {meals.map((item, idx) => (
              <MealCard key={String(item?.meal || idx)} meal={item?.meal} item={item} />
            ))}
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Ionicons name="sparkles-outline" size={20} color="white" />
              </View>
              <Text style={styles.emptyTitle}>Your plan for today</Text>
              <Text style={styles.emptyText}>
                Generate a practical breakfast, lunch, dinner, and snack—tailored to your profile.
              </Text>
              <Pressable
                disabled={generating}
                onPress={generateToday}
                style={[styles.primaryButton, generating ? { opacity: 0.65 } : null]}
              >
                {generating ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="sparkles" size={16} color="white" />}
                <Text style={styles.primaryButtonText}>{generating ? 'Generating…' : 'Generate today’s plan'}</Text>
              </Pressable>
              <Text style={styles.hintText}>
                You can generate a new plan anytime.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    paddingHorizontal: 16,
    paddingBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: Colors.text,
  },
  headerSubtitle: {
    marginTop: 6,
    color: Colors.textLight,
    lineHeight: 20,
  },
  headerActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  headerPrimaryButton: {
    flex: 1,
    backgroundColor: Colors.primaryDark,
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerPrimaryButtonText: {
    color: 'white',
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  headerSecondaryButton: {
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: '#F9FAFB',
  },
  headerSecondaryButtonText: {
    color: Colors.text,
    fontWeight: '800',
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  center: {
    paddingTop: 36,
    alignItems: 'center',
  },
  centerText: {
    marginTop: 10,
    color: Colors.textLight,
  },
  summaryCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 14,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F0FFF4',
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  dateChipText: {
    fontWeight: '900',
    color: Colors.primaryDark,
  },
  premiumChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#FFFAF0',
    borderWidth: 1,
    borderColor: '#FBD38D',
  },
  premiumChipText: {
    fontWeight: '900',
    color: Colors.text,
  },
  summaryText: {
    marginTop: 10,
    color: Colors.textLight,
    lineHeight: 20,
  },
  emptyWrap: {
    paddingTop: 6,
  },
  heroCard: {
    backgroundColor: Colors.surface,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: Colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.text,
  },
  emptyText: {
    marginTop: 8,
    color: Colors.textLight,
    lineHeight: 20,
  },
  primaryButton: {
    marginTop: 14,
    backgroundColor: Colors.primary,
    borderRadius: 999,
    paddingVertical: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  primaryButtonText: {
    color: 'white',
    fontWeight: '800',
  },
  mealCard: {
    backgroundColor: Colors.surface,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  mealTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 8,
  },
  mealTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F0FFF4',
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  mealTagText: {
    fontWeight: '900',
    color: Colors.primaryDark,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  timeChipText: {
    fontWeight: '800',
    color: Colors.textLight,
  },
  mealName: {
    fontSize: 16,
    fontWeight: '800',
    color: Colors.text,
  },
  mealDescription: {
    marginTop: 6,
    color: Colors.textLight,
    lineHeight: 19,
  },
  noteBox: {
    marginTop: 10,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#EBF8FF',
    borderWidth: 1,
    borderColor: '#BEE3F8',
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  noteText: {
    flex: 1,
    color: Colors.text,
    lineHeight: 18,
    fontWeight: '600',
  },
  section: {
    marginTop: 10,
  },
  sectionTitle: {
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 6,
  },
  sectionBoxTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  sectionBoxTitle: {
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 0.2,
  },
  sectionBox: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sectionBoxNutrition: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#EBF8FF',
    borderWidth: 1,
    borderColor: '#BEE3F8',
  },
  sectionBoxSteps: {
    marginTop: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: '#F0FFF4',
    borderWidth: 1,
    borderColor: '#C6F6D5',
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  pillText: {
    color: Colors.text,
    fontWeight: '700',
  },
  pillNutrition: {
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#BEE3F8',
  },
  pillNutritionText: {
    color: Colors.text,
    fontWeight: '800',
  },
  step: {
    color: Colors.textLight,
    lineHeight: 18,
    marginBottom: 4,
  },
  hintText: {
    marginTop: 12,
    color: Colors.textMuted,
    lineHeight: 18,
  },
});
