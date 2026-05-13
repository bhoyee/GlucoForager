import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator, Alert, Image } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { Colors } from '../../constants/Colors';
import RecipePlaceholder from '../../assets/images/recipe-placeholder.jpeg';

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

export default function DailyPlanScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const todayKey = dateKey();
  const [plan, setPlan] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [refreshingImages, setRefreshingImages] = useState(false);
  const [selectedMeal, setSelectedMeal] = useState(null);

  const loadPlanForDate = useCallback(async (targetDate = dateKey()) => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      setPlan(null);
      return null;
    }
    setLoading(true);
    try {
      const safeDate = targetDate || dateKey();
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.DAILY_PLAN_BY_DATE}?plan_date=${encodeURIComponent(safeDate)}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut, timeoutMs: 8000 }
      );
      if (response.status === 403) {
        setPlan(null);
        return null;
      }
      if (!response.ok) return null;
      const data = await response.json().catch(() => null);
      const nextPlan = data?.plan || null;
      setPlan(nextPlan);
      setSelectedMeal(null);
      return nextPlan;
    } finally {
      setLoading(false);
    }
  }, [signOut]);

  const refreshImagesUntilReady = useCallback(async () => {
    if (refreshingImages) return;
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return;
    setRefreshingImages(true);
    try {
      const started = Date.now();
      const maxMs = 25000;
      // Poll a few times while the backend background task attaches images.
      // Stop early once all images are real.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 3500));
        // eslint-disable-next-line no-await-in-loop
        const response = await apiFetch(
          `${API_URL}${API_ENDPOINTS.DAILY_PLAN_BY_DATE}?plan_date=${encodeURIComponent(selectedDate)}`,
          { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut, timeoutMs: 8000 }
        );
        if (response.ok) {
          // eslint-disable-next-line no-await-in-loop
          const data = await response.json().catch(() => null);
          const nextPlan = data?.plan || null;
          if (nextPlan) {
            setPlan(nextPlan);
            setSelectedMeal((current) => {
              if (!current) return current;
              const updatedMeals = Array.isArray(nextPlan?.meals) ? nextPlan.meals : [];
              return updatedMeals.find((m) => String(m?.meal || '') === String(current?.meal || '')) || current;
            });
          }
          const meals = Array.isArray(nextPlan?.meals) ? nextPlan.meals : [];
          if (meals.length && meals.every((m) => !isPlaceholderImage(m))) {
            break;
          }
        }
        if (Date.now() - started >= maxMs) break;
      }
    } finally {
      setRefreshingImages(false);
    }
  }, [refreshingImages, selectedDate, signOut]);

  const hasAnyPlaceholderImages = useMemo(() => {
    const meals = Array.isArray(plan?.meals) ? plan.meals : [];
    if (!meals.length) return false;
    return meals.some((m) => isPlaceholderImage(m));
  }, [plan]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const run = async () => {
        if (!active) return;
        await loadPlanForDate(selectedDate);
      };
      run();
      return () => {
        active = false;
      };
    }, [loadPlanForDate, selectedDate])
  );

  const generateToday = async ({ force } = {}) => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) return;
    setSelectedDate(todayKey);
    setGenerating(true);
    try {
      const shouldForce = force === true;
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.DAILY_PLAN_GENERATE}${shouldForce ? '?force=1' : ''}`,
        { method: 'POST', headers: { Authorization: `Bearer ${token}` } },
        // Daily plan now generates meal images before responding (premium UX).
        // Allow a bit more time so slower networks don't abort prematurely.
        { onUnauthorized: signOut, timeoutMs: 65000 }
      );
      if (response.status === 403) {
        Alert.alert('Premium required', 'Daily Meal Planner is available for Premium users.');
        return;
      }

      let data = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        const detail = data?.detail;
        const message =
          typeof detail === 'string'
            ? detail
            : typeof detail?.message === 'string'
              ? detail.message
              : response.status === 429
                ? 'Limit reached. Upgrade to Premium to generate more meal plans.'
                : 'Please try again.';

        if (response.status === 429) {
          Alert.alert('Upgrade to Premium', String(message));
        } else {
          Alert.alert('Could not generate plan', String(message));
        }
        return;
      }
      setPlan(data?.plan || null);
      setSelectedMeal(null);
    } finally {
      setGenerating(false);
    }
  };

  const meals = Array.isArray(plan?.meals) ? plan.meals : [];
  const isSelectedToday = selectedDate === todayKey;
  const selectedDateLabel = parsePlanDate(selectedDate).toLocaleDateString('en-GB', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
  const dateChips = useMemo(() => buildWeekDateChips(selectedDate), [selectedDate]);
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
          <Pressable style={styles.notificationButton}>
            <Ionicons name="notifications-outline" size={21} color="white" />
            <View style={styles.notificationDot} />
          </Pressable>
        </View>

        {meals.length ? (
          <View style={styles.headerActions}>
            {isSelectedToday ? (
              <Pressable
                disabled={generating}
                onPress={() => generateToday({ force: true })}
                style={[styles.headerPrimaryButton, generating ? { opacity: 0.7 } : null]}
              >
                {generating ? (
                  <ActivityIndicator size="small" color={Colors.primaryDark} />
                ) : (
                  <Ionicons name="refresh-outline" size={16} color={Colors.primaryDark} />
                )}
                <Text style={styles.headerPrimaryButtonText}>Regenerate</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={() => loadPlanForDate(selectedDate)} style={styles.headerSecondaryButton}>
              <Ionicons name="refresh-outline" size={16} color="white" />
              <Text style={styles.headerSecondaryButtonText}>Refresh</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.centerText}>Loading your daily plan...</Text>
          </View>
        ) : selectedMeal ? (
          <MealPlanDetail
            meal={selectedMeal?.meal}
            item={selectedMeal}
            showImageLoading={refreshingImages || generating}
            onBack={() => setSelectedMeal(null)}
          />
        ) : meals.length ? (
          <>
            <View style={styles.summaryCard}>
              <View style={styles.insightIcon}>
                <Ionicons name="leaf-outline" size={24} color={Colors.primaryDark} />
              </View>
              <View style={styles.summaryCopy}>
                <View style={styles.summaryTopRow}>
                  <Text style={styles.summaryTitle}>Balanced for you</Text>
                  <Ionicons name="chevron-forward" size={20} color={Colors.primaryDark} />
                </View>
                {typeof plan?.summary === 'string' && plan.summary.trim() ? (
                  <Text style={styles.summaryText} numberOfLines={2}>{plan.summary.trim()}</Text>
                ) : (
                  <Text style={styles.summaryText} numberOfLines={2}>
                    Designed with low glycemic ingredients to support stable blood sugar.
                  </Text>
                )}
              </View>
            </View>

            <Text style={styles.sectionHeading}>{isSelectedToday ? "Today's Plan" : selectedDateLabel}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateRail}
            >
              {dateChips.map((item) => (
                <Pressable
                  key={item.key}
                  disabled={item.future}
                  onPress={() => {
                    setSelectedDate(item.key);
                    setSelectedMeal(null);
                    void loadPlanForDate(item.key);
                  }}
                  style={[
                    styles.dayChip,
                    item.active ? styles.dayChipActive : null,
                    item.future ? styles.dayChipFuture : null,
                  ]}
                >
                  <Text style={[styles.dayChipDay, item.active ? styles.dayChipDayActive : null]}>{item.day}</Text>
                  <Text style={[styles.dayChipDate, item.active ? styles.dayChipDateActive : null]}>{item.date}</Text>
                </Pressable>
              ))}
            </ScrollView>

            {hasAnyPlaceholderImages ? (
              <View style={styles.imagesHintRow}>
                <Text style={styles.imagesHintText}>Some images are missing. Tap Refresh to try again.</Text>
                <Pressable onPress={refreshImagesUntilReady} disabled={refreshingImages} style={styles.imagesHintButton}>
                  <Text style={styles.imagesHintButtonText}>{refreshingImages ? 'Refreshing...' : 'Refresh'}</Text>
                </Pressable>
              </View>
            ) : null}

            {meals.map((item, idx) => (
              <CompactMealCard
                key={String(item?.meal || idx)}
                meal={item?.meal}
                item={item}
                showImageLoading={refreshingImages || generating}
                onPress={() => setSelectedMeal(item)}
              />
            ))}
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <Text style={styles.sectionHeading}>{isSelectedToday ? "Today's Plan" : selectedDateLabel}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.dateRail}
            >
              {dateChips.map((item) => (
                <Pressable
                  key={item.key}
                  disabled={item.future}
                  onPress={() => {
                    setSelectedDate(item.key);
                    setSelectedMeal(null);
                    void loadPlanForDate(item.key);
                  }}
                  style={[
                    styles.dayChip,
                    item.active ? styles.dayChipActive : null,
                    item.future ? styles.dayChipFuture : null,
                  ]}
                >
                  <Text style={[styles.dayChipDay, item.active ? styles.dayChipDayActive : null]}>{item.day}</Text>
                  <Text style={[styles.dayChipDate, item.active ? styles.dayChipDateActive : null]}>{item.date}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <View style={styles.heroCard}>
              <View style={styles.heroIcon}>
                <Ionicons name="calendar-clear-outline" size={20} color="white" />
              </View>
              <Text style={styles.emptyTitle}>
                {isSelectedToday ? 'Your plan for today' : `No plan for ${selectedDateLabel}`}
              </Text>
              <Text style={styles.emptyText}>
                {isSelectedToday
                  ? 'Generate a practical breakfast, lunch, dinner, and snack - tailored to your profile.'
                  : 'No meal plan was generated for this day. Past plans stay available here when they exist.'}
              </Text>
              {isSelectedToday ? (
                <>
                  <Pressable
                    disabled={generating}
                    onPress={generateToday}
                    style={[styles.primaryButton, generating ? { opacity: 0.65 } : null]}
                  >
                    {generating ? <ActivityIndicator size="small" color="white" /> : <Ionicons name="calendar-outline" size={16} color="white" />}
                    <Text style={styles.primaryButtonText}>{generating ? 'Generating...' : "Generate today's plan"}</Text>
                  </Pressable>
                  <Text style={styles.hintText}>
                    You can generate a new plan anytime.
                  </Text>
                </>
              ) : null}
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
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 20,
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
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
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
  notificationButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    position: 'relative',
  },
  notificationDot: {
    position: 'absolute',
    top: 8,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#B9F6CA',
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
});
