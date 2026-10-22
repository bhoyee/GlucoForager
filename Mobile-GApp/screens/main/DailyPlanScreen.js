import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { Colors } from '../../constants/Colors';
import { trackEvent } from '../../utils/analytics';
import RecipePlaceholder from '../../assets/images/recipe-placeholder.jpeg';
import GlucoseImpactCard, { ImpactPill } from '../../components/GlucoseImpactCard';
import { LinearGradient } from 'expo-linear-gradient';
import { confirmMealLogged } from '../../utils/mealLogConfirm';
import { generateIdempotencyKey } from '../../utils/idempotency';

const isPlaceholderImage = (item) => {
  const src = String(item?.image_source || '').toLowerCase();
  if (src === 'placeholder') return true;
  const url = typeof item?.image_url === 'string' ? item.image_url.trim().toLowerCase() : '';
  if (!url) return true;
  return url.includes('placeholder') || url.includes('/uploads/placeholders/') || url.includes('placeholders');
};

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

function parsePlanDate(value) {
  const raw = typeof value === 'string' && value.trim() ? value.trim() : '';
  const date = raw ? new Date(`${raw}T12:00:00`) : new Date();
  if (Number.isNaN(date.getTime())) return new Date();
  return date;
}

function dateKey(value = new Date()) {
  const date = value instanceof Date ? value : parsePlanDate(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildWeekDateChips(selectedDateKey) {
  const today = new Date();
  const todayKey = dateKey(today);
  const selected = parsePlanDate(selectedDateKey || todayKey);
  const weekStart = new Date(selected);
  const day = weekStart.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  weekStart.setDate(weekStart.getDate() + mondayOffset);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(weekStart);
    date.setDate(weekStart.getDate() + index);
    const key = dateKey(date);
    const isToday = key === todayKey;
    const isFuture = key > todayKey;
    return {
      key,
      day: isToday ? 'Today' : date.toLocaleDateString('en-GB', { weekday: 'short' }),
      date: date.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' }),
      active: key === selectedDateKey,
      future: isFuture,
      today: isToday,
    };
  });
}

function cleanNutritionValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.trim();
  return '';
}

function MealCard({ meal, item, showImageLoading }) {
  const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
  const steps = Array.isArray(item?.steps) ? item.steps : [];
  const minutes = Number.isFinite(Number(item?.time_minutes)) ? Number(item.time_minutes) : null;
  const nutrition = item?.nutrition_estimate && typeof item.nutrition_estimate === 'object' ? item.nutrition_estimate : null;
  const calories = cleanNutritionValue(nutrition?.calories);
  const carbs = cleanNutritionValue(nutrition?.carbs_g);
  const protein = cleanNutritionValue(nutrition?.protein_g);
  const fiber = cleanNutritionValue(nutrition?.fiber_g);
  const imageUrl = typeof item?.image_url === 'string' ? item.image_url.trim() : '';
  const showPlaceholder = isPlaceholderImage(item);

  return (
    <View style={styles.mealCard}>
      <View style={styles.mealImageWrap}>
        {imageUrl && !showPlaceholder ? (
          <Image source={{ uri: imageUrl }} style={styles.mealImage} resizeMode="cover" />
        ) : (
          <Image source={RecipePlaceholder} style={styles.mealImage} resizeMode="cover" />
        )}
        {showPlaceholder && showImageLoading ? (
          <View style={styles.mealImageOverlay}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.mealImageOverlayText}>Generating image…</Text>
          </View>
        ) : null}
      </View>
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

      <Text style={styles.mealName}>{item?.title || item?.name || '--'}</Text>
      {item?.glucose_impact ? (
        <View style={styles.impactChipRow}>
          <ImpactPill impact={item.glucose_impact} small />
        </View>
      ) : null}
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

function CompactMealCard({ meal, item, showImageLoading, onPress }) {
  const minutes = Number.isFinite(Number(item?.time_minutes)) ? Number(item.time_minutes) : null;
  const nutrition = item?.nutrition_estimate && typeof item.nutrition_estimate === 'object' ? item.nutrition_estimate : null;
  const calories = cleanNutritionValue(nutrition?.calories);
  const carbs = cleanNutritionValue(nutrition?.carbs_g);
  const protein = cleanNutritionValue(nutrition?.protein_g);
  const fiber = cleanNutritionValue(nutrition?.fiber_g);
  const imageUrl = typeof item?.image_url === 'string' ? item.image_url.trim() : '';
  const showPlaceholder = isPlaceholderImage(item);

  return (
    <Pressable style={styles.mealCard} onPress={onPress}>
      <View style={styles.mealTopRow}>
        <View style={styles.mealTitleRow}>
          <View style={styles.mealIconBubble}>
            <Ionicons name={mealIcon(meal)} size={17} color={Colors.primaryDark} />
          </View>
          <Text style={styles.mealTagText}>{titleCase(meal || 'Meal')}</Text>
        </View>
        {minutes ? (
          <View style={styles.timeChip}>
            <Ionicons name="time-outline" size={14} color={Colors.textLight} />
            <Text style={styles.timeChipText}>{minutes} min</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.mealBodyRow}>
        <View style={styles.mealImageWrap}>
          {imageUrl && !showPlaceholder ? (
            <Image source={{ uri: imageUrl }} style={styles.mealImage} resizeMode="cover" />
          ) : (
            <Image source={RecipePlaceholder} style={styles.mealImage} resizeMode="cover" />
          )}
          {showPlaceholder && showImageLoading ? (
            <View style={styles.mealImageOverlay}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.mealImageOverlayText}>Generating image...</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.mealCopy}>
          <Text style={styles.mealName} numberOfLines={2}>{item?.title || item?.name || '--'}</Text>
          {item?.glucose_impact ? (
            <View style={styles.impactChipRow}>
              <ImpactPill impact={item.glucose_impact} small />
            </View>
          ) : null}
          <View style={styles.pillRow}>
            {calories ? (
              <View style={[styles.pillNutrition, styles.caloriePill]}>
                <Text style={[styles.pillNutritionText, styles.caloriePillText]}>{calories} cal</Text>
              </View>
            ) : null}
            {protein ? (
              <View style={[styles.pillNutrition, styles.proteinPill]}>
                <Text style={[styles.pillNutritionText, styles.proteinPillText]}>{protein} protein</Text>
              </View>
            ) : null}
            {fiber ? (
              <View style={[styles.pillNutrition, styles.fiberPill]}>
                <Text style={[styles.pillNutritionText, styles.fiberPillText]}>{fiber} fiber</Text>
              </View>
            ) : null}
            {carbs ? (
              <View style={[styles.pillNutrition, styles.carbsPill]}>
                <Text style={[styles.pillNutritionText, styles.carbsPillText]}>{carbs} carbs</Text>
              </View>
            ) : null}
          </View>
        </View>
        <Ionicons name="chevron-forward" size={20} color={Colors.textMuted} />
      </View>
    </Pressable>
  );
}

function MealPlanDetail({ meal, item, showImageLoading, onBack }) {
  const ingredients = Array.isArray(item?.ingredients) ? item.ingredients : [];
  const steps = Array.isArray(item?.steps) ? item.steps : [];
  const minutes = Number.isFinite(Number(item?.time_minutes)) ? Number(item.time_minutes) : null;
  const nutrition = item?.nutrition_estimate && typeof item.nutrition_estimate === 'object' ? item.nutrition_estimate : null;
  const calories = cleanNutritionValue(nutrition?.calories);
  const carbs = cleanNutritionValue(nutrition?.carbs_g);
  const protein = cleanNutritionValue(nutrition?.protein_g);
  const fiber = cleanNutritionValue(nutrition?.fiber_g);
  const imageUrl = typeof item?.image_url === 'string' ? item.image_url.trim() : '';
  const showPlaceholder = isPlaceholderImage(item);

  return (
    <View style={styles.detailWrap}>
      <Pressable onPress={onBack} style={styles.detailBackButton}>
        <Ionicons name="chevron-back" size={20} color={Colors.text} />
        <Text style={styles.detailBackText}>Plan</Text>
      </Pressable>

      <View style={styles.detailImageWrap}>
        {imageUrl && !showPlaceholder ? (
          <Image source={{ uri: imageUrl }} style={styles.detailImage} resizeMode="cover" />
        ) : (
          <Image source={RecipePlaceholder} style={styles.detailImage} resizeMode="cover" />
        )}
        {showPlaceholder && showImageLoading ? (
          <View style={styles.mealImageOverlay}>
            <ActivityIndicator size="small" color="white" />
            <Text style={styles.mealImageOverlayText}>Generating image...</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.detailHeaderCard}>
        <View style={styles.mealTopRow}>
          <View style={styles.mealTitleRow}>
            <View style={styles.mealIconBubble}>
              <Ionicons name={mealIcon(meal)} size={17} color={Colors.primaryDark} />
            </View>
            <Text style={styles.mealTagText}>{titleCase(meal || 'Meal')}</Text>
          </View>
          {minutes ? (
            <View style={styles.timeChip}>
              <Ionicons name="time-outline" size={14} color={Colors.textLight} />
              <Text style={styles.timeChipText}>{minutes} min</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.detailTitle}>{item?.title || item?.name || '--'}</Text>
        {item?.glucose_impact ? (
          <GlucoseImpactCard impact={item.glucose_impact} style={styles.impactCard} />
        ) : null}
        {typeof item?.description === 'string' && item.description.trim() ? (
          <Text style={styles.detailDescription}>{item.description.trim()}</Text>
        ) : null}
      </View>

      {calories || carbs || protein || fiber ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Nutrition estimate</Text>
          <View style={styles.pillRow}>
            {calories ? (
              <View style={[styles.pillNutrition, styles.caloriePill]}>
                <Text style={[styles.pillNutritionText, styles.caloriePillText]}>{calories} cal</Text>
              </View>
            ) : null}
            {protein ? (
              <View style={[styles.pillNutrition, styles.proteinPill]}>
                <Text style={[styles.pillNutritionText, styles.proteinPillText]}>{protein} protein</Text>
              </View>
            ) : null}
            {fiber ? (
              <View style={[styles.pillNutrition, styles.fiberPill]}>
                <Text style={[styles.pillNutritionText, styles.fiberPillText]}>{fiber} fiber</Text>
              </View>
            ) : null}
            {carbs ? (
              <View style={[styles.pillNutrition, styles.carbsPill]}>
                <Text style={[styles.pillNutritionText, styles.carbsPillText]}>{carbs} carbs</Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {typeof item?.note === 'string' && item.note.trim() ? (
        <View style={styles.detailNote}>
          <Ionicons name="information-circle-outline" size={18} color={Colors.secondary} />
          <Text style={styles.noteText}>{item.note.trim()}</Text>
        </View>
      ) : null}

      {ingredients.length ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Ingredients</Text>
          <View style={styles.pillRow}>
            {ingredients.map((ing, idx) => (
              <View key={`${meal}-detail-ing-${idx}`} style={styles.pill}>
                <Text style={styles.pillText}>{String(ing)}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {steps.length ? (
        <View style={styles.detailSection}>
          <Text style={styles.detailSectionTitle}>Steps</Text>
          {steps.map((step, idx) => (
            <View key={`${meal}-detail-step-${idx}`} style={styles.detailStepRow}>
              <View style={styles.detailStepNumber}>
                <Text style={styles.detailStepNumberText}>{idx + 1}</Text>
              </View>
              <Text style={styles.detailStepText}>{String(step)}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const SLOT_TIME = { breakfast: '8:00', lunch: '13:00', snack: '16:00', dinner: '19:00' };
const SLOT_ORDER = { breakfast: 1, lunch: 2, snack: 3, dinner: 4 };

function addDays(key, n) {
  const d = parsePlanDate(key);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}

function rangeMid(value) {
  const nums = String(value || '').match(/\d+(?:\.\d+)?/g);
  if (!nums || !nums.length) return null;
  const pick = nums.slice(0, 2).map(Number);
  return Math.round(pick.reduce((a, b) => a + b, 0) / pick.length);
}

// One meal in the day's timeline: time, photo, carbs, impact, and I ate this / Swap.
function TimelineMeal({ item, canEat, canSwap, busy, onOpen, onEat, onSwap, last }) {
  const nutrition = item?.nutrition_estimate && typeof item.nutrition_estimate === 'object' ? item.nutrition_estimate : null;
  const carbs = cleanNutritionValue(nutrition?.carbs_g);
  const imageUrl = typeof item?.image_url === 'string' ? item.image_url.trim() : '';
  const eaten = Boolean(item?.eaten);
  const swapping = busy === `swap:${item?.meal}`;
  return (
    <View style={styles.tlRow}>
      <View style={styles.tlRail}>
        <View style={[styles.tlDot, eaten && styles.tlDotDone]}>
          {eaten ? <Ionicons name="checkmark" size={12} color="white" /> : <Ionicons name={mealIcon(item?.meal)} size={12} color={Colors.primary} />}
        </View>
        {!last ? <View style={styles.tlLine} /> : null}
      </View>
      <Pressable style={[styles.tlCard, eaten && styles.tlCardDone]} onPress={onOpen}>
        <View style={styles.tlTop}>
          <Text style={styles.tlSlot}>
            {titleCase(item?.meal || 'Meal')} · {SLOT_TIME[item?.meal] || ''}
          </Text>
          {item?.glucose_impact ? <ImpactPill impact={item.glucose_impact} small /> : null}
        </View>
        <View style={styles.tlBody}>
          {imageUrl && !isPlaceholderImage(item) ? (
            <Image source={{ uri: imageUrl }} style={styles.tlImage} />
          ) : (
            <Image source={RecipePlaceholder} style={styles.tlImage} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.tlTitle} numberOfLines={2}>{item?.title || item?.name || '--'}</Text>
            <Text style={styles.tlMeta}>
              {carbs ? `${carbs} carbs` : ''}
              {item?.time_minutes ? `${carbs ? ' · ' : ''}${item.time_minutes} min` : ''}
            </Text>
          </View>
        </View>
        <View style={styles.tlActions}>
          {eaten ? (
            <View style={[styles.tlBtn, styles.tlBtnDone]}>
              <Ionicons name="checkmark-circle" size={15} color="#2C8632" />
              <Text style={[styles.tlBtnText, { color: '#2C8632' }]}>Eaten</Text>
            </View>
          ) : canEat ? (
            <Pressable style={[styles.tlBtn, styles.tlBtnEat]} onPress={onEat} disabled={Boolean(busy)}>
              <Ionicons name="restaurant" size={14} color="white" />
              <Text style={[styles.tlBtnText, { color: 'white' }]}>I ate this</Text>
            </Pressable>
          ) : null}
          {canSwap && !eaten ? (
            <Pressable style={[styles.tlBtn, styles.tlBtnSwap]} onPress={onSwap} disabled={Boolean(busy)}>
              {swapping ? <ActivityIndicator size="small" color="#6B46C1" /> : <Ionicons name="swap-horizontal" size={14} color="#6B46C1" />}
              <Text style={[styles.tlBtnText, { color: '#6B46C1' }]}>{swapping ? 'Swapping…' : 'Swap'}</Text>
            </Pressable>
          ) : null}
        </View>
      </Pressable>
    </View>
  );
}

export default function DailyPlanScreen() {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const todayKey = dateKey();
  const lastKey = addDays(todayKey, 2);
  const [plan, setPlan] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(null); // 'generate' | 'range' | 'swap:<slot>' | 'eat' | 'shop'
  const [rangeProgress, setRangeProgress] = useState(null);
  const [refreshingImages, setRefreshingImages] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);
  const [planned, setPlanned] = useState([]);
  const [carbGoal, setCarbGoal] = useState(null);

  const authHeaders = async () => {
    const token = await AsyncStorage.getItem('userToken');
    return token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : null;
  };
  const q = (extra = '') => `local_today=${todayKey}${extra}`;

  const loadDays = useCallback(async () => {
    const headers = await authHeaders();
    if (!headers) return;
    try {
      const res = await apiFetch(`${API_URL}/api/app/daily-plan/days?${q()}`, { headers }, { onUnauthorized: signOut, timeoutMs: 8000 });
      if (res.ok) setPlanned((await res.json())?.planned || []);
    } catch {
      // Optional ticks.
    }
    try {
      const mid = new Date();
      mid.setHours(0, 0, 0, 0);
      const res = await apiFetch(
        `${API_URL}/api/app/health-log/today?local_day_start=${encodeURIComponent(mid.toISOString())}`,
        { headers },
        { onUnauthorized: signOut, timeoutMs: 8000 }
      );
      if (res.ok) {
        const d = await res.json();
        setCarbGoal(d?.carb_goal_mode === 'ceiling' ? d?.carb_goal_g || null : null);
      }
    } catch {
      // Optional.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signOut, todayKey]);

  const loadPlanForDate = useCallback(async (targetDate = todayKey) => {
    const headers = await authHeaders();
    if (!headers) {
      setPlan(null);
      return null;
    }
    setLoading(true);
    try {
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.DAILY_PLAN_BY_DATE}?plan_date=${encodeURIComponent(targetDate)}&${q()}`,
        { method: 'GET', headers },
        { onUnauthorized: signOut, timeoutMs: 8000 }
      );
      if (!response.ok) {
        setPlan(null);
        return null;
      }
      const data = await response.json().catch(() => null);
      setPlan(data?.plan || null);
      setSelectedMeal(null);
      return data?.plan || null;
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signOut, todayKey]);

  const refreshImagesUntilReady = useCallback(async () => {
    if (refreshingImages) return;
    const headers = await authHeaders();
    if (!headers) return;
    setRefreshingImages(true);
    try {
      const started = Date.now();
      // Poll while the backend attaches images; stop once all are real.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 3500));
        // eslint-disable-next-line no-await-in-loop
        const response = await apiFetch(
          `${API_URL}${API_ENDPOINTS.DAILY_PLAN_BY_DATE}?plan_date=${encodeURIComponent(selectedDate)}&${q()}`,
          { method: 'GET', headers },
          { onUnauthorized: signOut, timeoutMs: 8000 }
        );
        if (response.ok) {
          // eslint-disable-next-line no-await-in-loop
          const nextPlan = (await response.json().catch(() => null))?.plan || null;
          if (nextPlan) setPlan(nextPlan);
          const meals = Array.isArray(nextPlan?.meals) ? nextPlan.meals : [];
          if (meals.length && meals.every((m) => !isPlaceholderImage(m))) break;
        }
        if (Date.now() - started >= 25000) break;
      }
    } finally {
      setRefreshingImages(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshingImages, selectedDate, signOut, todayKey]);

  useFocusEffect(
    useCallback(() => {
      loadDays();
      loadPlanForDate(selectedDate);
    }, [loadDays, loadPlanForDate, selectedDate])
  );

  // Plan one day (today or up to two days ahead). Returns the plan, or null with an alert.
  const generateDay = async (dateToPlan, { force = false, quiet = false } = {}) => {
    const headers = await authHeaders();
    if (!headers) return null;
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.DAILY_PLAN_GENERATE}?plan_date=${dateToPlan}&${q(force ? '&force=1' : '')}`,
      { method: 'POST', headers },
      { onUnauthorized: signOut, timeoutMs: 65000 }
    );
    const data = await response.json().catch(() => null);
    if (response.status === 403) {
      Alert.alert('Premium required', 'Daily Meal Planner is available for Premium users.');
      return null;
    }
    if (!response.ok) {
      const detail = data?.detail;
      const message = typeof detail === 'string' ? detail : detail?.message || 'Please try again.';
      trackEvent('meal_plan_generation_blocked', { reason: response.status === 429 ? 'rate_limited' : 'error' });
      if (!quiet) Alert.alert(response.status === 429 ? 'Limit reached' : 'Could not generate plan', String(message));
      return { error: String(message) };
    }
    trackEvent('meal_plan_generated', { regenerated: force, days_ahead: Math.round((parsePlanDate(dateToPlan) - parsePlanDate(todayKey)) / 86400000) });
    setPlanned((p) => Array.from(new Set([...p, dateToPlan])));
    return data?.plan || null;
  };

  const handlePlanDay = async ({ force = false } = {}) => {
    setBusy('generate');
    try {
      const next = await generateDay(selectedDate, { force });
      if (next && !next.error) {
        setPlan(next);
        setSelectedMeal(null);
      }
    } finally {
      setBusy(null);
    }
  };

  // Fill any unplanned day from today to two days ahead.
  const handlePlanNextDays = async () => {
    const missing = [0, 1, 2].map((n) => addDays(todayKey, n)).filter((k) => !planned.includes(k));
    if (!missing.length) return;
    setBusy('range');
    try {
      for (let i = 0; i < missing.length; i += 1) {
        setRangeProgress(`Planning ${i + 1} of ${missing.length}…`);
        // eslint-disable-next-line no-await-in-loop
        const result = await generateDay(missing[i], { quiet: true });
        if (result?.error) {
          Alert.alert('Planning stopped', result.error);
          break;
        }
        if (missing[i] === selectedDate && result) setPlan(result);
      }
    } finally {
      setRangeProgress(null);
      setBusy(null);
      loadPlanForDate(selectedDate);
    }
  };

  const handleSwap = (item) => {
    Alert.alert(`Swap ${item.meal}?`, `We'll replace "${item.title}" with a new idea and keep the rest of the day.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Swap',
        onPress: async () => {
          const headers = await authHeaders();
          if (!headers) return;
          setBusy(`swap:${item.meal}`);
          try {
            const res = await apiFetch(
              `${API_URL}/api/app/daily-plan/swap-meal?meal=${item.meal}&plan_date=${selectedDate}&${q()}`,
              { method: 'POST', headers },
              { onUnauthorized: signOut, timeoutMs: 65000 }
            );
            const data = await res.json().catch(() => null);
            if (!res.ok) {
              Alert.alert('Could not swap', data?.detail?.message || (typeof data?.detail === 'string' ? data.detail : 'Please try again.'));
              return;
            }
            trackEvent('meal_plan_meal_swapped', { meal: item.meal });
            setPlan(data?.plan || plan);
          } finally {
            setBusy(null);
          }
        },
      },
    ]);
  };

  const handleAte = async (item) => {
    const headers = await authHeaders();
    if (!headers) return;
    setBusy('eat');
    try {
      const carbs = rangeMid(item?.nutrition_estimate?.carbs_g);
      const title = String(item?.title || 'Planned meal').slice(0, 200);
      const res = await apiFetch(
        `${API_URL}/api/app/meals`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            description: title,
            food_name: title.slice(0, 80),
            source: 'recipe',
            ...(carbs != null ? { carbs_g: carbs, carbs_estimated: true } : {}),
            idempotency_key: generateIdempotencyKey(),
          }),
        },
        { onUnauthorized: signOut, timeoutMs: 8000 }
      );
      if (!res.ok) {
        Alert.alert('Unable to log meal', 'Please try again.');
        return;
      }
      const data = await res.json().catch(() => ({}));
      trackEvent('meal_logged', { source: 'meal_plan', has_carbs: carbs != null });
      setPlan((p) =>
        p ? { ...p, meals: p.meals.map((m) => (m.meal === item.meal ? { ...m, eaten: true } : m)), day: { ...(p.day || {}), eaten: (p.day?.eaten || 0) + 1 } } : p
      );
      if (!data?.duplicate) await confirmMealLogged({ name: title, loggedAt: data?.meal?.logged_at, carbs, carbsEstimated: true });
    } finally {
      setBusy(null);
    }
  };

  const handleShoppingList = async () => {
    const headers = await authHeaders();
    if (!headers) return;
    const items = Array.from(
      new Set(
        (plan?.meals || [])
          .flatMap((m) => (Array.isArray(m?.ingredients) ? m.ingredients : []))
          .map((i) => String(i).trim())
          .filter(Boolean)
      )
    );
    if (!items.length) return;
    setBusy('shop');
    try {
      const res = await apiFetch(
        `${API_URL}${API_ENDPOINTS.SHOPPING_LIST}`,
        { method: 'POST', headers, body: JSON.stringify({ title: `Meal plan · ${selectedDateLabel}`, items }) },
        { onUnauthorized: signOut, timeoutMs: 10000 }
      );
      if (!res.ok) {
        Alert.alert('Could not add', 'Please try again.');
        return;
      }
      trackEvent('meal_plan_shopping_list', { items: items.length });
      Alert.alert('Added to shopping list', `${items.length} ingredients for ${selectedDateLabel}.`, [
        { text: 'OK' },
        { text: 'View list', onPress: () => navigation.navigate('Profile', { screen: 'ShoppingList', initial: false }) },
      ]);
    } finally {
      setBusy(null);
    }
  };

  const meals = (Array.isArray(plan?.meals) ? plan.meals : []).slice().sort((a, b) => (SLOT_ORDER[a?.meal] || 9) - (SLOT_ORDER[b?.meal] || 9));
  const isSelectedToday = selectedDate === todayKey;
  const isPast = selectedDate < todayKey;
  const canPlan = selectedDate >= todayKey && selectedDate <= lastKey;
  const relativeLabel = (key) =>
    key === todayKey ? 'Today' : key === addDays(todayKey, 1) ? 'Tomorrow' : parsePlanDate(key).toLocaleDateString('en-GB', { weekday: 'long' });
  const selectedDateLabel = relativeLabel(selectedDate);
  const missingAhead = [0, 1, 2].map((n) => addDays(todayKey, n)).filter((k) => !planned.includes(k));
  const day = plan?.day || {};
  const carbPct = carbGoal && day.carbs_g ? Math.min(day.carbs_g / carbGoal, 1) : null;
  const strip = [-3, -2, -1, 0, 1, 2].map((n) => {
    const key = addDays(todayKey, n);
    const d = parsePlanDate(key);
    return {
      key,
      top: n === 0 ? 'Today' : n === 1 ? 'Tmrw' : d.toLocaleDateString('en-GB', { weekday: 'short' }),
      date: d.getDate(),
      planned: planned.includes(key),
      future: n > 0,
    };
  });

  return (
    <View style={styles.container}>
      <View style={[styles.pHeader, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
        <View style={styles.headerRow}>
          <Pressable style={styles.backButton} onPress={() => navigation.navigate('Home')}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </Pressable>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={styles.headerTitle}>Meal Planner</Text>
            <Text style={styles.headerSubtitle}>Plan today and up to 2 days ahead</Text>
          </View>
        </View>
        <View style={styles.pStrip}>
          {strip.map((c) => {
            const active = c.key === selectedDate;
            return (
              <Pressable
                key={c.key}
                style={[styles.pDay, active && styles.pDayActive]}
                onPress={() => {
                  setSelectedDate(c.key);
                  setSelectedMeal(null);
                }}
              >
                <Text style={[styles.pDayTop, active && styles.pDayTextActive]}>{c.top}</Text>
                <Text style={[styles.pDayDate, active && styles.pDayTextActive]}>{c.date}</Text>
                <View style={[styles.pDayMark, c.planned ? styles.pDayMarkOn : c.future ? styles.pDayMarkOpen : null]}>
                  {c.planned ? <Ionicons name="checkmark" size={9} color="white" /> : c.future ? <Ionicons name="add" size={10} color="rgba(255,255,255,0.8)" /> : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
      <ScrollView
        style={{ marginTop: -28 }} contentContainerStyle={[{ paddingBottom: insets.bottom + 32 }, { paddingTop: 28 }]} showsVerticalScrollIndicator={false}>

        <View style={styles.pBody}>
          {loading && !plan ? (
            <View style={styles.center}>
              <ActivityIndicator size="large" color={Colors.primary} />
              <Text style={styles.centerText}>Loading your plan…</Text>
            </View>
          ) : selectedMeal ? (
            <MealPlanDetail meal={selectedMeal?.meal} item={selectedMeal} showImageLoading={refreshingImages} onBack={() => setSelectedMeal(null)} />
          ) : meals.length ? (
            <>
              {/* Day overview */}
              <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pSummary}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pSummaryLabel}>{selectedDateLabel}&apos;s plan</Text>
                  <Text style={styles.pSummaryCarbs}>
                    {day.carbs_g != null ? `${day.carbs_g}g` : '—'}
                    <Text style={styles.pSummaryOf}>{carbGoal ? ` of ${carbGoal}g carbs` : ' carbs'}</Text>
                  </Text>
                  {carbPct != null ? (
                    <View style={styles.pBarTrack}>
                      <View style={[styles.pBarFill, { width: `${carbPct * 100}%` }]} />
                    </View>
                  ) : null}
                  <View style={styles.pSummaryChips}>
                    {Object.entries(day.impact_counts || {}).map(([k, n]) => (
                      <View key={k} style={styles.pSummaryChip}>
                        <Text style={styles.pSummaryChipText}>
                          {n} {k}
                        </Text>
                      </View>
                    ))}
                    {!isPast ? (
                      <View style={styles.pSummaryChip}>
                        <Text style={styles.pSummaryChipText}>
                          {day.eaten || 0} of {day.total || meals.length} eaten
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
                <View style={styles.pSummaryIcon}>
                  <Ionicons name="calendar" size={24} color="white" />
                </View>
              </LinearGradient>

              {typeof plan?.summary === 'string' && plan.summary.trim() ? <Text style={styles.pNote}>{plan.summary.trim()}</Text> : null}

              {refreshingImages ? (
                <View style={styles.imagesHintRow}>
                  <ActivityIndicator size="small" color={Colors.primary} />
                  <Text style={styles.imagesHintText}>Adding meal photos…</Text>
                </View>
              ) : meals.some((m) => isPlaceholderImage(m)) ? (
                <Pressable style={styles.imagesHintRow} onPress={refreshImagesUntilReady}>
                  <Ionicons name="images-outline" size={15} color={Colors.primary} />
                  <Text style={styles.imagesHintText}>Some photos are missing. Tap to load them.</Text>
                </Pressable>
              ) : null}

              {/* Timeline */}
              <View style={{ marginTop: 6 }}>
                {meals.map((item, idx) => (
                  <TimelineMeal
                    key={String(item?.meal || idx)}
                    item={item}
                    last={idx === meals.length - 1}
                    canEat={selectedDate <= todayKey}
                    canSwap={canPlan}
                    busy={busy}
                    onOpen={() => setSelectedMeal(item)}
                    onEat={() => handleAte(item)}
                    onSwap={() => handleSwap(item)}
                  />
                ))}
              </View>

              {/* Actions */}
              <View style={styles.pActions}>
                <Pressable style={[styles.pAction, styles.pActionShop]} onPress={handleShoppingList} disabled={Boolean(busy)}>
                  {busy === 'shop' ? <ActivityIndicator size="small" color="#DD6B20" /> : <Ionicons name="cart" size={16} color="#DD6B20" />}
                  <Text style={[styles.pActionText, { color: '#C05621' }]}>Shopping list</Text>
                </Pressable>
                {canPlan ? (
                  <Pressable
                    style={styles.pAction}
                    onPress={() =>
                      Alert.alert('New plan for this day?', 'Replace all four meals with new ideas.', [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'New plan', onPress: () => handlePlanDay({ force: true }) },
                      ])
                    }
                    disabled={Boolean(busy)}
                  >
                    {busy === 'generate' ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="refresh" size={16} color={Colors.primary} />}
                    <Text style={styles.pActionText}>New plan</Text>
                  </Pressable>
                ) : null}
              </View>
              {missingAhead.length ? (
                <Pressable style={styles.pRangeShadow} onPress={handlePlanNextDays} disabled={Boolean(busy)}>
                  <LinearGradient colors={['#8B6BD9', '#6B46C1']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pRange}>
                    {busy === 'range' ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="calendar-number" size={18} color="white" />}
                    <Text style={styles.pRangeText}>
                      {rangeProgress || `Plan the next 3 days · ${missingAhead.length} day${missingAhead.length === 1 ? '' : 's'} to go`}
                    </Text>
                  </LinearGradient>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={styles.pEmpty}>
              <View style={styles.pEmptyIcon}>
                <Ionicons name={isPast ? 'time-outline' : 'calendar-clear'} size={28} color={Colors.primary} />
              </View>
              <Text style={styles.pEmptyTitle}>{isPast ? `No plan for ${parsePlanDate(selectedDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}` : `Plan ${selectedDateLabel.toLowerCase() === 'today' ? 'today' : selectedDateLabel}`}</Text>
              <Text style={styles.pEmptyText}>
                {isPast
                  ? 'Past plans stay here when you make them.'
                  : 'Breakfast, lunch, dinner and a snack, fitted to your carb goal and to what your own readings show works for you.'}
              </Text>
              {canPlan ? (
                <>
                  <Pressable style={styles.pRangeShadow} onPress={() => handlePlanDay()} disabled={Boolean(busy)}>
                    <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pRange}>
                      {busy === 'generate' ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="sparkles" size={18} color="white" />}
                      <Text style={styles.pRangeText}>{busy === 'generate' ? 'Planning…' : `Plan ${isSelectedToday ? 'today' : selectedDateLabel}`}</Text>
                    </LinearGradient>
                  </Pressable>
                  {missingAhead.length > 1 ? (
                    <Pressable style={styles.pLinkBtn} onPress={handlePlanNextDays} disabled={Boolean(busy)}>
                      <Text style={styles.pLinkText}>{rangeProgress || `Or plan all ${missingAhead.length} days at once`}</Text>
                    </Pressable>
                  ) : null}
                </>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  impactChipRow: { flexDirection: 'row', marginTop: 6 },
  impactCard: { marginTop: 14 },
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 20,
    marginHorizontal: -16,
    marginTop: -20,
    marginBottom: 20,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
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
  headerTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: 'white',
  },
  headerSubtitle: {
    marginTop: 4,
    color: 'rgba(255,255,255,0.78)',
    lineHeight: 20,
    fontWeight: '600',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  headerActions: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  headerPrimaryButton: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  headerPrimaryButtonText: {
    color: Colors.primaryDark,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  headerSecondaryButton: {
    borderRadius: 15,
    paddingVertical: 14,
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  headerSecondaryButtonText: {
    color: 'white',
    fontWeight: '800',
  },
  content: {
    padding: 16,
    paddingTop: 20,
    paddingBottom: 34,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F6FBF7',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#DCEFE4',
    padding: 14,
    marginBottom: 18,
  },
  insightIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F5EA',
  },
  summaryCopy: {
    flex: 1,
    minWidth: 0,
  },
  summaryTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.primaryDark,
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
    marginTop: 4,
    color: Colors.textLight,
    lineHeight: 20,
  },
  sectionHeading: {
    fontSize: 20,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
  },
  dateRail: {
    gap: 10,
    paddingRight: 16,
    paddingBottom: 18,
  },
  dayChip: {
    minWidth: 78,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  dayChipActive: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  dayChipFuture: {
    opacity: 0.45,
  },
  dayChipDay: {
    fontWeight: '900',
    color: Colors.text,
  },
  dayChipDayActive: {
    color: '#FFFFFF',
  },
  dayChipDate: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textLight,
  },
  dayChipDateActive: {
    color: '#E8FFF3',
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
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  mealImageWrap: {
    width: 118,
    height: 118,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F2F4F7',
    position: 'relative',
  },
  mealImage: {
    width: '100%',
    height: '100%',
  },
  mealImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  mealImageOverlayText: {
    fontSize: 12,
    color: 'white',
    fontWeight: '700',
  },
  imagesHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
    paddingHorizontal: 6,
  },
  imagesHintText: {
    flex: 1,
    fontSize: 12,
    color: Colors.textMuted,
  },
  imagesHintButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imagesHintButtonText: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '600',
  },
  mealTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  mealTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    minWidth: 0,
  },
  mealIconBubble: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F5EA',
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
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
  },
  timeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: '#EEF8F1',
  },
  timeChipText: {
    fontWeight: '800',
    color: Colors.primaryDark,
  },
  mealBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mealCopy: {
    flex: 1,
    minWidth: 0,
  },
  mealName: {
    fontSize: 17,
    fontWeight: '900',
    color: Colors.text,
  },
  mealDescription: {
    marginTop: 6,
    color: Colors.textLight,
    lineHeight: 19,
    marginBottom: 10,
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
    gap: 7,
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
    paddingVertical: 6,
    paddingHorizontal: 9,
    backgroundColor: '#FFFFFF',
  },
  pillNutritionText: {
    color: Colors.text,
    fontWeight: '800',
    fontSize: 12,
  },
  caloriePill: {
    backgroundColor: '#FFF3E8',
  },
  caloriePillText: {
    color: '#C05621',
  },
  proteinPill: {
    backgroundColor: '#EAF7EE',
  },
  proteinPillText: {
    color: Colors.primaryDark,
  },
  fiberPill: {
    backgroundColor: '#EBF5FF',
  },
  fiberPillText: {
    color: Colors.secondary,
  },
  carbsPill: {
    backgroundColor: '#F8FAFC',
  },
  carbsPillText: {
    color: Colors.textLight,
  },
  detailWrap: {
    paddingBottom: 10,
  },
  detailBackButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingRight: 12,
    marginBottom: 6,
  },
  detailBackText: {
    color: Colors.text,
    fontWeight: '900',
  },
  detailImageWrap: {
    height: 230,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#F2F4F7',
    position: 'relative',
    marginBottom: 14,
  },
  detailImage: {
    width: '100%',
    height: '100%',
  },
  detailHeaderCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  detailTitle: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '900',
    color: Colors.text,
  },
  detailDescription: {
    marginTop: 8,
    color: Colors.textLight,
    lineHeight: 21,
  },
  detailSection: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: Colors.text,
    marginBottom: 12,
  },
  detailNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 9,
    backgroundColor: '#EBF8FF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BEE3F8',
    padding: 14,
    marginBottom: 12,
  },
  detailStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  detailStepNumber: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E3F5EA',
  },
  detailStepNumberText: {
    color: Colors.primaryDark,
    fontWeight: '900',
    fontSize: 12,
  },
  detailStepText: {
    flex: 1,
    color: Colors.text,
    lineHeight: 20,
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
  // ---- Planner (premium) ----
  pHeader: { zIndex: 10, elevation: 5, backgroundColor: Colors.primaryDark, paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  pStrip: { flexDirection: 'row', gap: 6, marginTop: 16 },
  pDay: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)' },
  pDayActive: { backgroundColor: 'white' },
  pDayTop: { fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.8)' },
  pDayDate: { fontSize: 17, fontWeight: '900', color: 'white', marginTop: 2 },
  pDayTextActive: { color: Colors.primaryDark },
  pDayMark: { width: 14, height: 14, borderRadius: 7, marginTop: 4, alignItems: 'center', justifyContent: 'center' },
  pDayMarkOn: { backgroundColor: '#56C75D' },
  pDayMarkOpen: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.45)' },
  pBody: { padding: 16, gap: 12 },
  pSummary: { flexDirection: 'row', gap: 12, borderRadius: 22, padding: 18 },
  pSummaryLabel: { fontSize: 12.5, fontWeight: '800', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 0.5 },
  pSummaryCarbs: { fontSize: 30, fontWeight: '900', color: 'white', marginTop: 4 },
  pSummaryOf: { fontSize: 14, fontWeight: '700', color: 'rgba(255,255,255,0.85)' },
  pBarTrack: { height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.22)', marginTop: 8, overflow: 'hidden' },
  pBarFill: { height: '100%', borderRadius: 4, backgroundColor: '#B9F6CA' },
  pSummaryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  pSummaryChip: { backgroundColor: 'rgba(255,255,255,0.16)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pSummaryChipText: { color: 'white', fontSize: 12, fontWeight: '800', textTransform: 'capitalize' },
  pSummaryIcon: { width: 46, height: 46, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  pNote: { fontSize: 13, lineHeight: 19, color: Colors.textLight, paddingHorizontal: 4 },
  tlRow: { flexDirection: 'row', gap: 10 },
  tlRail: { alignItems: 'center', width: 26 },
  tlDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#E8F4F3', borderWidth: 2, borderColor: '#CDE7E4', alignItems: 'center', justifyContent: 'center' },
  tlDotDone: { backgroundColor: '#2C8632', borderColor: '#2C8632' },
  tlLine: { width: 2, flex: 1, backgroundColor: '#DCEBE9', marginVertical: 2 },
  tlCard: {
    flex: 1,
    backgroundColor: 'white',
    borderRadius: 18,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#EDF0EA',
    shadowColor: '#0F2A3A',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 1,
  },
  tlCardDone: { opacity: 0.75 },
  tlTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  tlSlot: { fontSize: 12, fontWeight: '900', color: Colors.primary, textTransform: 'uppercase', letterSpacing: 0.4 },
  tlBody: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  tlImage: { width: 64, height: 64, borderRadius: 14, backgroundColor: '#E5E7EB' },
  tlTitle: { fontSize: 15.5, fontWeight: '900', color: Colors.brandNavy },
  tlMeta: { fontSize: 12.5, color: Colors.textLight, marginTop: 3 },
  tlActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  tlBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  tlBtnEat: { backgroundColor: '#2C8632' },
  tlBtnDone: { backgroundColor: '#E9F6EA' },
  tlBtnSwap: { backgroundColor: '#F0EBFB' },
  tlBtnText: { fontSize: 12.5, fontWeight: '900' },
  pActions: { flexDirection: 'row', gap: 10 },
  pAction: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, height: 48, borderRadius: 14, backgroundColor: '#E8F4F3', borderWidth: 1.5, borderColor: '#CDE7E4' },
  pActionShop: { backgroundColor: '#FFF1E6', borderColor: '#F8D9BD' },
  pActionText: { fontSize: 14, fontWeight: '900', color: Colors.primary },
  pRangeShadow: { borderRadius: 16, shadowColor: '#3F2A7A', shadowOpacity: 0.2, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  pRange: { height: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
  pRangeText: { color: 'white', fontSize: 15, fontWeight: '900' },
  pEmpty: { alignItems: 'center', backgroundColor: 'white', borderRadius: 22, padding: 22, borderWidth: 1, borderColor: '#EDF0EA', gap: 10 },
  pEmptyIcon: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E8F4F3', alignItems: 'center', justifyContent: 'center' },
  pEmptyTitle: { fontSize: 19, fontWeight: '900', color: Colors.brandNavy, textAlign: 'center' },
  pEmptyText: { fontSize: 13.5, lineHeight: 20, color: Colors.textLight, textAlign: 'center', marginBottom: 6 },
  pLinkBtn: { paddingVertical: 6 },
  pLinkText: { fontSize: 14, fontWeight: '900', color: '#6B46C1' },
});
