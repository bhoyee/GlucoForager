// screens/main/HomeScreen.js - UPDATED PRODUCTION VERSION
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Image,
  useWindowDimensions,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { getRecipeImageSettings } from '../../utils/recipeImageSettings';
import {
  getCachedRecipeImageUrl,
  isDurableRecipeImageUrl,
  isPlaceholderRecipeImageUrl,
  setCachedRecipeImageUrl,
} from '../../utils/recipeImageCache';
import { getTodayTip } from '../../utils/todayTips';
import { scheduleDailyPlanNotifications } from '../../utils/mealReminders';
import CarbGoalRing, { getCarbGoalRingColor } from '../../components/CarbGoalRing';
import { getCarbGoalTitle, getCarbGoalSubtitle, getCarbGoalDisclaimer } from '../../utils/carbGoal';
import { trackEvent } from '../../utils/analytics';
import { FREE_FEATURES, getFreeUsage, hasFreeUsesLeft, showFreeLimitAlert } from '../../utils/freeTier';
import BrandWordmark from '../../components/BrandWordmark';
import GlucoseRangeRing from '../../components/GlucoseRangeRing';
import { parseServerDate } from '../../utils/dateUtils';
import { SAFETY_LINES, describeReading, formatGlucose, getGlucoseUnit, statusMeta, timeAgo } from '../../utils/glucose';

// "Last used" ingredients older than this are hidden - fridge contents change.
const LAST_USED_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// Basics pushed to the end of the "Last used" chips so the first ones are the real food.
const PANTRY_BASICS = new Set(['salt', 'pepper', 'black pepper', 'oil', 'olive oil', 'vegetable oil', 'water', 'sugar', 'garlic', 'onion', 'butter', 'flour', 'vinegar', 'spices', 'seasoning']);

const LAST_INGREDIENTS_KEY = 'last_used_ingredients_v1';

// Home action tiles: soft gradient, tinted border, solid icon badge in the same hue.
const TILE_THEMES = {
  green: { accent: '#2C8632', subColor: '#2C7A31', border: '#CBE9CD', gradient: ['#E2F4E3', '#F6FBF6'] },
  blue: { accent: '#2B6CB0', subColor: '#2B5F99', border: '#CADDF4', gradient: ['#E0ECFB', '#F5F9FE'] },
  orange: { accent: '#E8890C', subColor: '#B86A05', border: '#F6DDB4', gradient: ['#FFEED5', '#FFF9F0'] },
  violet: { accent: '#6B46C1', subColor: '#5B3BA6', border: '#DDD3F5', gradient: ['#ECE5FB', '#F8F6FE'] },
};

export default function HomeScreen() {
  const navigation = useNavigation();
  // Narrow phones (under ~380dp, e.g. small Androids / iPhone SE): the 2x2 action tiles
  // stack the icon above the text so labels like "Scan Barcode" never get cut off.
  const { width: screenWidth } = useWindowDimensions();
  const compactTiles = screenWidth < 380;
  const { signOut, foodProfileHasPreferences } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 4, 6);
  const [greetingName, setGreetingName] = useState('');
  
  const [userIsPremium, setUserIsPremium] = useState(false);
  const [accessStatus, setAccessStatus] = useState('expired');
  const [trialDaysLeft, setTrialDaysLeft] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [suggestedRecipes, setSuggestedRecipes] = useState([]);
  const [recipeImagesEnabled, setRecipeImagesEnabled] = useState(true);
  const [recentRecipes, setRecentRecipes] = useState([]);
  const [isFetchingRecipes, setIsFetchingRecipes] = useState(false);
  const [blockedTipIds, setBlockedTipIds] = useState([]);
  const [serverTodayTip, setServerTodayTip] = useState(null);
  const [dailyChallenge, setDailyChallenge] = useState(null);
  const [healthLogSummary, setHealthLogSummary] = useState(null);
  const [insightHighlight, setInsightHighlight] = useState(null);
  const todayTip = useMemo(() => {
    if (serverTodayTip?.title && (serverTodayTip?.tip || serverTodayTip?.body)) return serverTodayTip;
    return getTodayTip(new Date(), { blockedTipIds });
  }, [blockedTipIds, serverTodayTip]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [networkError, setNetworkError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [userStats, setUserStats] = useState({
    recipesGenerated: 0,
    scansToday: 0,
    favoritesSaved: 0,
  });
  const [showShoppingListNewDot, setShowShoppingListNewDot] = useState(false);
  const [glucoseUnit, setGlucoseUnit] = useState('mg/dL');
  const [lastUsed, setLastUsed] = useState(null); // { items, source, updatedAt }
  const [freeRecipeUsage, setFreeRecipeUsage] = useState(null);
  const [showWeeklyRecapNewDot, setShowWeeklyRecapNewDot] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadNewFeatureFlags = async () => {
      const [shoppingListSeen, weeklyRecapSeen] = await Promise.all([
        AsyncStorage.getItem('seen_feature_shopping_list_v1'),
        AsyncStorage.getItem('seen_feature_weekly_recap_v1'),
      ]);
      if (cancelled) return;
      setShowShoppingListNewDot(shoppingListSeen !== 'true');
      setShowWeeklyRecapNewDot(weeklyRecapSeen !== 'true');
    };
    loadNewFeatureFlags().catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const loadTipConfig = async () => {
    try {
      const cached = await AsyncStorage.getItem('tips_blocked_ids_v1');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          setBlockedTipIds(parsed.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()));
        }
      }
    } catch {
      // ignore cache errors
    }

    try {
      const response = await apiFetch(
        `${API_URL}/api/app/tips/config`,
        { method: 'GET' },
        { timeoutMs: 12000 }
      );
      if (!response.ok) return;
      const data = await response.json();
      const raw = data?.blocked_tip_ids;
      const blocked = Array.isArray(raw) ? raw.filter((x) => typeof x === 'string' && x.trim()).map((x) => x.trim()) : [];
      setBlockedTipIds(blocked);
      await AsyncStorage.setItem('tips_blocked_ids_v1', JSON.stringify(blocked));
    } catch {
      // ignore network errors
    }
  };

  const loadTodayTip = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      const response = await apiFetch(
        `${API_URL}/api/app/tips/today`,
        { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : undefined },
        { timeoutMs: 12000 }
      );
      if (!response.ok) return;
      const data = await response.json();
      const tip = data?.tip;
      if (tip?.title) {
        setServerTodayTip(tip);
      }
    } catch {
      // ignore
    }
  };

  const loadDailyChallenge = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setDailyChallenge(null);
        return;
      }
      const response = await apiFetch(
        `${API_URL}/api/app/challenge/today`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 12000 }
      );
      if (!response.ok) return;
      const data = await response.json();
      if (data?.challenge?.tasks?.length) {
        setDailyChallenge(data.challenge);
      }
    } catch {
      // ignore network errors
    }
  };

  const loadHealthLogSummary = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setHealthLogSummary(null);
        return;
      }
      // "Today" must mean the phone's local calendar day, not the server's UTC day -
      // send local midnight as a UTC instant so entries near the day boundary land on
      // the correct side regardless of timezone.
      const localMidnight = new Date();
      localMidnight.setHours(0, 0, 0, 0);
      const response = await apiFetch(
        `${API_URL}/api/app/health-log/today?local_day_start=${encodeURIComponent(localMidnight.toISOString())}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 12000 }
      );
      if (!response.ok) return;
      const data = await response.json();
      setHealthLogSummary(data);
    } catch {
      // ignore network errors
    }
  };

  // The one insight worth showing on Home (Glucose insights, last 30 days).
  const loadInsightHighlight = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const tz = -new Date().getTimezoneOffset();
      const response = await apiFetch(
        `${API_URL}/api/app/health-log/insights?days=30&tz_offset_minutes=${tz}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { timeoutMs: 12000 }
      );
      if (!response.ok) return;
      setInsightHighlight((await response.json())?.highlight || null);
    } catch {
      // Optional card: Home works without it.
    }
  };

  const loadGlucoseUnit = async () => {
    setGlucoseUnit(await getGlucoseUnit());
  };

  const loadLastUsed = async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      setLastUsed(null);
      return;
    }
    const res = await apiFetch(
      `${API_URL}${API_ENDPOINTS.USER_LAST_INGREDIENTS}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { onUnauthorized: signOut, timeoutMs: 10000 }
    );
    if (!res.ok) return;
    const data = await res.json();
    const items = Array.isArray(data?.ingredients) ? data.ingredients.filter(Boolean) : [];
    const updatedAt = data?.updated_at ? Date.parse(data.updated_at) : NaN;
    if (!items.length || (Number.isFinite(updatedAt) && Date.now() - updatedAt > LAST_USED_MAX_AGE_MS)) {
      setLastUsed(null);
      return;
    }
    const ordered = [
      ...items.filter((i) => !PANTRY_BASICS.has(String(i).toLowerCase().trim())),
      ...items.filter((i) => PANTRY_BASICS.has(String(i).toLowerCase().trim())),
    ];
    setLastUsed({ items: ordered, source: data?.source || null, updatedAt: data?.updated_at || null });
    await AsyncStorage.setItem(LAST_INGREDIENTS_KEY, JSON.stringify(items));
  };

  const loadGreetingName = async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setGreetingName('');
        return;
      }

      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
        { method: 'GET', headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut, timeoutMs: 12000 }
      );
      if (!response.ok) return;
      const data = await response.json().catch(() => ({}));
      const fullName = typeof data?.full_name === 'string' ? data.full_name.trim() : '';
      if (!fullName) {
        setGreetingName('');
        return;
      }
      const first = fullName.split(/\s+/).filter(Boolean)[0] || '';
      setGreetingName(first);
    } catch {
      // ignore network errors
    }
  };

  const getDeviceId = async () => {
    const existing = await AsyncStorage.getItem('deviceId');
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem('deviceId', generated);
    return generated;
  };

  const loadCachedData = async () => {
    try {
      const cachedScan = await AsyncStorage.getItem('home_scan_status');
      if (cachedScan) {
        const data = JSON.parse(cachedScan);
        if (typeof data.isPremium === 'boolean') {
          setUserIsPremium(data.isPremium);
        }
        if (typeof data.accessStatus === 'string') {
          setAccessStatus(data.accessStatus);
        }
        if (data.trialDaysLeft !== undefined) {
          setTrialDaysLeft(data.trialDaysLeft);
        }
      }

      const cachedStats = await AsyncStorage.getItem('home_user_stats');
      if (cachedStats) {
        const stats = JSON.parse(cachedStats);
        setUserStats({
          recipesGenerated: stats.recipesGenerated || 0,
          scansToday: stats.scansToday || 0,
          favoritesSaved: stats.favoritesSaved || 0,
        });
      }

      const cachedSuggestions = await AsyncStorage.getItem('home_suggestions');
      if (cachedSuggestions) {
        const suggestions = JSON.parse(cachedSuggestions);
        if (Array.isArray(suggestions)) {
          setSuggestedRecipes(suggestions);
        }
      }

      const cachedRecent = await AsyncStorage.getItem('home_recent_recipes');
      if (cachedRecent) {
        const recentItems = JSON.parse(cachedRecent);
        if (Array.isArray(recentItems)) {
          setRecentRecipes(await hydrateRecentRecipeImages(recentItems));
        }
      }
    } catch (error) {
      // Ignore cache errors.
    }
  };

  const loadUserData = useCallback(async () => {
    try {
      if (isInitialLoad) {
        setIsLoading(true);
      } else {
        setIsRefreshing(true);
      }
      setNetworkError(null);

      await loadCachedData();

      const loadRecipeImagesFlag = async () => {
        const settings = await getRecipeImageSettings();
        setRecipeImagesEnabled(Boolean(settings?.enabled));
      };

      const results = await Promise.allSettled([
        loadScanStatus(),
        loadUserStats(),
        loadRecipes(),
        loadRecipeImagesFlag(),
        loadGreetingName(),
        loadTipConfig(),
        loadTodayTip(),
        loadDailyChallenge(),
        loadHealthLogSummary(),
        loadInsightHighlight(),
        loadGlucoseUnit(),
        loadLastUsed(),
      ]);

      const allFailed = results.every((result) => result.status === 'rejected');
      if (allFailed) {
        setNetworkError('Unable to connect. Check your internet or server.');
      }
    } catch (error) {
      setNetworkError('Unable to connect. Check your internet or server.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
      setIsInitialLoad(false);
    }
  }, [isInitialLoad]);

  // Load user data
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const loadIfActive = async () => {
        if (!isActive) return;
        await loadUserData();
      };
      loadIfActive();
      return () => {
        isActive = false;
      };
    }, [loadUserData])
  );

  const loadScanStatus = async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      setUserIsPremium(false);
      setTodayScans(0);
      setRemainingScans(0);
      setDailyLimit(0);
      setAccessStatus('expired');
      setTrialDaysLeft(0);
      return;
    }

    const deviceId = await getDeviceId();
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.SCANS_TODAY}`,
      { headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId } },
      { onUnauthorized: signOut, timeoutMs: 12000 }
    );
    if (response.status === 401) {
      setUserIsPremium(false);
      setAccessStatus('expired');
      setTrialDaysLeft(0);
      return;
    }
    if (!response.ok) {
      throw new Error('Unable to fetch scan status.');
    }
    const data = await response.json();
    const isPremium = data.is_premium === true || data.subscription_tier === 'premium';
    const nextAccessStatus = data.access_status || (isPremium || hasActiveAccess(data) ? 'premium' : 'expired');
    setUserIsPremium(isPremium);
    setAccessStatus(nextAccessStatus);
    setTrialDaysLeft(data.trial_days_left ?? null);
    setFreeRecipeUsage(getFreeUsage(data, FREE_FEATURES.RECIPE_GENERATION));

    await AsyncStorage.setItem(
      'home_scan_status',
      JSON.stringify({
        isPremium,
        accessStatus: nextAccessStatus,
        trialDaysLeft: data.trial_days_left ?? null,
      })
    );

    // Premium-only: schedule the Daily Plan reminder once we know the user's tier.
    try {
      await scheduleDailyPlanNotifications({ isPremium });
    } catch {
      // Ignore scheduling failures.
    }
  };

  const getMealType = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour <= 10) return 'breakfast';
    if (hour >= 11 && hour <= 15) return 'lunch';
    if (hour >= 16 && hour <= 21) return 'dinner';
    return 'snack';
  };

  const loadUserStats = async () => {
    const token = await AsyncStorage.getItem('userToken');
    if (!token) {
      setUserStats({ recipesGenerated: 0, scansToday: 0, favoritesSaved: 0 });
      return;
    }
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.USER_STATS}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { onUnauthorized: signOut, timeoutMs: 12000 }
    );
    if (response.status === 401) {
      setUserStats({ recipesGenerated: 0, scansToday: 0, favoritesSaved: 0 });
      return;
    }
    if (!response.ok) {
      setUserStats({ recipesGenerated: 0, scansToday: 0, favoritesSaved: 0 });
      return;
    }
    const data = await response.json();
    setUserStats({
      recipesGenerated: data.recipes_generated || 0,
      scansToday: data.scans_today || 0,
      favoritesSaved: data.favorites_saved || 0,
    });
    await AsyncStorage.setItem(
      'home_user_stats',
      JSON.stringify({
        recipesGenerated: data.recipes_generated || 0,
        scansToday: data.scans_today || 0,
        favoritesSaved: data.favorites_saved || 0,
      })
    );
  };

  const loadRecipes = async () => {
    try {
      setIsFetchingRecipes(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setSuggestedRecipes([]);
        setRecentRecipes([]);
        return;
      }

      await Promise.allSettled([
        fetchSuggestions(token),
        fetchRecentRecipes(token),
      ]);
    } catch (error) {
      // Keep last known suggestions on error.
    } finally {
      setIsFetchingRecipes(false);
    }
  };

  const fetchSuggestions = async (token) => {
    const mealType = getMealType();
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.RECIPE_SUGGESTIONS}?limit=3&meal_type=${mealType}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { onUnauthorized: signOut, timeoutMs: 12000 }
    );
    if (response.status === 401) {
      return;
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    setSuggestedRecipes(items);
    await AsyncStorage.setItem('home_suggestions', JSON.stringify(items));
  };

  const fetchRecentRecipes = async (token) => {
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.RECENT_RECIPES}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { onUnauthorized: signOut, timeoutMs: 12000 }
    );
    if (response.status === 401) {
      return;
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    const hydrated = await hydrateRecentRecipeImages(items);
    setRecentRecipes(hydrated);
    await AsyncStorage.setItem('home_recent_recipes', JSON.stringify(hydrated));
  };

  const hasActiveAccess = (data = {}) =>
    data.has_feature_access === true ||
    data.is_premium === true ||
    ['premium', 'trialing', 'trial', 'cancelled_active', 'legacy_grace', 'grace'].includes(String(data.access_status || '').toLowerCase()) ||
    data.searches_left === 'unlimited';

  const currentAccessStatus = String(accessStatus || '').toLowerCase();
  const hasCurrentFeatureAccess =
    userIsPremium ||
    ['premium', 'trialing', 'trial', 'cancelled_active', 'legacy_grace', 'grace'].includes(currentAccessStatus);

  const getAccessLabel = () => {
    if (userIsPremium || currentAccessStatus === 'premium') return 'Premium active';
    if (currentAccessStatus === 'cancelled_active') {
      const days = Number(trialDaysLeft);
      return Number.isFinite(days) && days > 0 ? `${days} day${days === 1 ? '' : 's'} left` : 'Active until period ends';
    }
    if (['trialing', 'trial', 'legacy_grace', 'grace'].includes(currentAccessStatus)) {
      const days = Number(trialDaysLeft);
      return Number.isFinite(days) && days > 0
        ? `${days} day${days === 1 ? '' : 's'} left`
        : currentAccessStatus === 'legacy_grace' || currentAccessStatus === 'grace'
          ? 'Welcome week'
          : 'Trial active';
    }
    if (currentAccessStatus === 'expired') return 'Free plan · Upgrade to Premium';
    return 'Upgrade to Premium';
  };

  const openPremiumPaywall = useCallback(() => {
    const params = { screen: 'ProfileMain', params: { openPremium: true } };
    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('Profile', params);
      return;
    }
    navigation.navigate('Profile', params);
  }, [navigation]);

  const isPlaceholderRecipeImage = (recipe) => {
    const source = String(recipe?.image_source || recipe?.imageSource || '').toLowerCase();
    if (source === 'placeholder') return true;
    return isPlaceholderRecipeImageUrl(recipe?.image_url || recipe?.image || '');
  };

  const getRecipeImageUrl = (recipe) => {
    if (!recipe || isPlaceholderRecipeImage(recipe)) return '';
    const direct = typeof recipe?.image_url === 'string' && recipe.image_url.trim()
      ? recipe.image_url.trim()
      : typeof recipe?.image === 'string' && recipe.image.trim()
        ? recipe.image.trim()
        : '';
    return isDurableRecipeImageUrl(direct) ? direct : '';
  };

  const hydrateRecentRecipeImages = async (items) => {
    return Promise.all(
      (items || []).map(async (recipe) => {
        if (!recipe || typeof recipe !== 'object') return recipe;
        const directUrl = getRecipeImageUrl(recipe);
        if (directUrl) {
          await setCachedRecipeImageUrl(recipe, directUrl);
          return { ...recipe, image_url: recipe.image_url || directUrl, image: recipe.image || directUrl };
        }
        const cached = await getCachedRecipeImageUrl(recipe);
        if (!cached) return { ...recipe, image_url: '', image: '', image_source: recipe.image_source || 'none' };
        return { ...recipe, image_url: cached, image: cached, image_source: 'ai' };
      })
    );
  };

  const handleShuffleSuggestions = async () => {
    try {
      setIsFetchingRecipes(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      await fetchSuggestions(token);
    } catch (error) {
      Alert.alert('Error', 'Unable to refresh suggestions right now.');
    } finally {
      setIsFetchingRecipes(false);
    }
  };

  const handleOpenSwaps = () => navigation.navigate('CarbSwaps');
  const handleOpenShoppingList = () => {
    setShowShoppingListNewDot(false);
    AsyncStorage.setItem('seen_feature_shopping_list_v1', 'true').catch(() => {});
    navigation.navigate('Profile', { screen: 'ShoppingList' });
  };
  const handleOpenWeeklyRecap = () => {
    setShowWeeklyRecapNewDot(false);
    AsyncStorage.setItem('seen_feature_weekly_recap_v1', 'true').catch(() => {});
    navigation.navigate('Profile', { screen: 'WeeklyRecap' });
  };
  const handleOpenChallenge = () => navigation.navigate('Challenge');
  const handleOpenTip = () => navigation.navigate('TodayTip', { tip: todayTip });
  const handleOpenLogMeal = () => navigation.navigate('LogMeal');
  const handleOpenLogGlucose = () => navigation.navigate('LogGlucose');
  const handleOpenBarcodeScan = () => navigation.navigate('Scan', { screen: 'BarcodeScan' });
  const handleOpenPhotoScan = () => navigation.navigate('Scan', { screen: 'PhotoScan' });

  const getRecipeTimeLabel = (recipe) => {
    const prepRaw = recipe.prep_time_minutes ?? recipe.prepTime ?? recipe.prep_time;
    const cookRaw = recipe.cook_time_minutes ?? recipe.cookTime ?? recipe.cook_time;
    const prep = typeof prepRaw === 'number' ? prepRaw : parseFloat(prepRaw);
    const cook = typeof cookRaw === 'number' ? cookRaw : parseFloat(cookRaw);
    const hasPrep = Number.isFinite(prep);
    const hasCook = Number.isFinite(cook);
    if (hasPrep || hasCook) {
      const total = (hasPrep ? prep : 0) + (hasCook ? cook : 0);
      const value = total || (hasPrep ? prep : 0) || (hasCook ? cook : 0);
      return `${value}`;
    }
    const timeLabel = recipe.time ?? '--';
    if (timeLabel === '--') return timeLabel;
    if (typeof timeLabel === 'number') {
      return `${timeLabel}`;
    }
    const normalized = `${timeLabel}`.trim();
    if (!normalized) return '--';
    const match = normalized.match(/[-+]?\d*\.?\d+/);
    if (match) return `${match[0]}`;
    return normalized;
  };

  const getRecipeTimeValue = (recipe) => {
    const timeLabel = getRecipeTimeLabel(recipe);
    if (!timeLabel || timeLabel === '--' || timeLabel === '') {
      return '--';
    }
    const timeStr = String(timeLabel).trim();
    if (!timeStr) return '--';
    const normalized = timeStr.replace(/\s*mins?\s*$/i, '').trim();
    return normalized || '--';
  };

  const getFeelingBadge = (recipe) => {
    if (recipe?.last_feeling === 'great') return { emoji: '🙂', label: 'You liked this' };
    if (recipe?.last_feeling === 'not_great') return { emoji: '🙁', label: 'Wasn\'t great' };
    return null;
  };

  const getRecipeCalories = (recipe) => {
    const value = recipe.nutrition?.calories ?? recipe.nutrition_per_serving?.calories;
    return formatNutrient(value, 'cal', 'Calories --');
  };

  const getRecipeProtein = (recipe) => {
    const value = recipe.nutrition?.protein ?? recipe.nutrition_per_serving?.protein;
    return formatNutrient(value, 'g pro', 'Pro --');
  };

  const getRecipeFiber = (recipe) => {
    const value = recipe.nutrition?.fiber ?? recipe.nutrition_per_serving?.fiber;
    return formatNutrient(value, 'g fib', 'Fib --');
  };

  const formatNutrient = (value, suffix, emptyLabel) => {
    if (value === undefined || value === null || value === '') return emptyLabel;
    if (typeof value === 'number') return `${value}${suffix ? ` ${suffix}` : ''}`.trim();
    const match = `${value}`.match(/[-+]?\d*\.?\d+/);
    if (match) return `${match[0]}${suffix ? ` ${suffix}` : ''}`.trim();
    return `${value}`.includes(suffix.trim()) ? `${value}` : `${value} ${suffix}`.trim();
  };

  const checkScanLimit = async (source = 'scan') => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to find recipes.');
        return;
      }
      const deviceId = await getDeviceId();
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.SCANS_TODAY}`,
        { headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        return;
      }
      const data = await response.json();
      const isPremium = data.is_premium === true || data.subscription_tier === 'premium';
      const fullAccess = hasActiveAccess(data);
      // Free users can still go ahead while they have this week's free uses left.
      const freeFeature = source === 'scan' ? FREE_FEATURES.INGREDIENT_SCAN : FREE_FEATURES.RECIPE_GENERATION;
      const allowed = fullAccess || hasFreeUsesLeft(data, freeFeature);
      setUserIsPremium(isPremium);
      setAccessStatus(data.access_status || (fullAccess ? 'premium' : 'expired'));
      setTrialDaysLeft(data.trial_days_left ?? null);

      if (allowed) {
        trackEvent('get_recipes_started', { source });
        if (source === 'manual') {
          navigation.navigate('ManualInput');
        } else if (source === 'surprise') {
          navigation.navigate('ManualInput', {
            autoSubmit: true,
            mode: 'surprise',
            source: 'eat_now_surprise',
          });
        } else if (source === 'quick') {
          navigation.navigate('ManualInput', {
            autoSubmit: true,
            mode: 'quick',
            source: 'eat_now_quick',
          });
        } else {
          // Navigate to Scan tab
          navigation.navigate('Scan', { screen: 'ScanMain' });
        }
      } else {
        trackEvent('get_recipes_blocked', { source, reason: getFreeUsage(data, freeFeature) ? 'free_limit' : 'paywall' });
        if (getFreeUsage(data, freeFeature)) {
          showFreeLimitAlert(
            {
              code: 'free_limit_reached',
              message:
                source === 'scan'
                  ? "You've used this week's free ingredient scans. Upgrade to Premium for unlimited access, or come back on Monday for more."
                  : "You've used this week's free recipe generations. Upgrade to Premium for unlimited access, or come back on Monday for more.",
            },
            openPremiumPaywall
          );
          return;
        }
        Alert.alert(
          'Upgrade to Premium',
          'Upgrade to Premium to use scan and recipe generation.',
          [
            { text: 'OK', style: 'cancel' },
            {
              text: 'Upgrade',
              onPress: openPremiumPaywall
            }
          ]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to check scan limit. Please try again.');
    }
  };

  const handleScanPress = () => {
    checkScanLimit('scan');
  };

  const handleManualInputPress = () => {
    checkScanLimit('manual');
  };

  const handleSurprisePress = () => {
    checkScanLimit('surprise');
  };

  const handleViewRecentRecipes = () => {
    navigation.navigate('RecentRecipes', { initialRecipes: recentRecipes });
  };

  const handleViewRecipeHistory = () => {
    navigation.navigate('RecentRecipes', {
      mode: 'history',
      totalRecipes: userStats.recipesGenerated,
    });
  };

  const handleViewRecipeDetail = (recipe) => {
    navigation.navigate('RecipeDetail', { recipe, source: 'admin' });
  };

  const handleViewAllRecipes = () => {
    navigation.navigate('RecipeResults', { 
      title: 'All Recipes',
      showBack: true 
    });
  };

  const handleUpgradePress = () => {
    navigation.navigate('Profile');
  };

  const handleUpgradePaywall = async () => {
    openPremiumPaywall();
  };

  // Welcome week / store trial running out: shown as a red badge so the deadline is noticed.
  const isAccessCountdown =
    !userIsPremium &&
    ['trialing', 'trial', 'legacy_grace', 'grace'].includes(currentAccessStatus) &&
    Number(trialDaysLeft) > 0;

  const getAccessBadgeLabel = () => {
    if (userIsPremium || currentAccessStatus === 'premium') return 'Premium';
    const days = Number(trialDaysLeft);
    const isWelcomeWeek = ['legacy_grace', 'grace'].includes(currentAccessStatus);
    if (['trialing', 'trial', 'legacy_grace', 'grace', 'cancelled_active'].includes(currentAccessStatus) && Number.isFinite(days) && days > 0) {
      return isWelcomeWeek
        ? `${days} free Premium day${days === 1 ? '' : 's'} left`
        : `${days} day${days === 1 ? '' : 's'} trial left`;
    }
    if (isWelcomeWeek) return 'Welcome week';
    if (['trialing', 'trial'].includes(currentAccessStatus)) return 'Trial active';
    if (currentAccessStatus === 'cancelled_active') return 'Active until expiry';
    return 'Free plan';
  };

  if (isLoading && isInitialLoad) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  const challengeCompleted = Number(dailyChallenge?.progress?.completed || 0);
  const challengeTotal = Number(dailyChallenge?.progress?.total || 0);
  const hasChallenge = Boolean(dailyChallenge?.tasks?.length);
  const streakDays = Number(dailyChallenge?.streak_days || 0);

  const carbsLoggedToday = healthLogSummary?.carbs_logged_today_g ?? null;
  const carbGoalMode = healthLogSummary?.carb_goal_mode || 'ceiling';
  const carbGoalToday = healthLogSummary?.carb_goal_g || (carbGoalMode === 'none' ? null : 130);
  const mealsLoggedToday = healthLogSummary?.meals_logged_today || 0;

  const carbGoalTitle = getCarbGoalTitle({ carbsLoggedToday, carbGoalToday, carbGoalMode, mealsLoggedToday });
  const carbGoalSubtitle = getCarbGoalSubtitle({ carbsLoggedToday, carbGoalToday, carbGoalMode });

  const showCarbGoalDisclaimer = () => {
    Alert.alert('About your carb target', getCarbGoalDisclaimer(carbGoalMode, carbGoalToday));
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return { text: 'Good morning', icon: 'sunny', color: '#F6AD55' };
    if (hour < 17) return { text: 'Good afternoon', icon: 'partly-sunny', color: '#F6AD55' };
    return { text: 'Good evening', icon: 'moon', color: '#805AD5' };
  };

  const getRecipeCarbs = (recipe) => {
    const raw =
      recipe?.nutrition?.carbs ??
      recipe?.nutrition?.carbohydrates ??
      recipe?.nutrition_per_serving?.carbs ??
      recipe?.nutrition_per_serving?.carbohydrates;
    const n = typeof raw === 'number' ? raw : parseFloat(raw);
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  const handleLastUsedPress = () => {
    if (!lastUsed?.items?.length) return;
    trackEvent('get_recipes_started', { source: 'last_used' });
    // Opens the list for editing first (fridge contents change) instead of re-running blindly.
    navigation.navigate('ManualInput', { prefillIngredients: lastUsed.items, source: 'last_used' });
  };

  const handleOpenGlucoseTargets = () => navigation.navigate('GlucoseTargets');

  const glucose = healthLogSummary?.glucose || null;
  const lastReading = glucose?.last || null;
  const lastMeta = lastReading ? statusMeta(lastReading.status) : null;
  const week = glucose?.week || null;
  const prevWeek = glucose?.prev_week || null;

  // Counts, not percentages: "4 of 4" is honest about how few readings there are,
  // where "100%" from two readings oversells it. Windows are rolling 7 days.
  const getWeeklyInsight = () => {
    if (!week?.readings) {
      return { text: 'Log your glucose to see how your week is going.', tone: 'neutral' };
    }
    const text = `Last 7 days: ${week.in_range} of ${week.readings} reading${week.readings === 1 ? '' : 's'} on target`;
    if (!prevWeek?.readings) return { text, tone: 'neutral' };
    const sub = `Previous 7 days: ${prevWeek.in_range} of ${prevWeek.readings}`;
    // Tone compares the share on target, so more readings logged doesn't look like a drop.
    const pct = week.in_range / week.readings;
    const prev = prevWeek.in_range / prevWeek.readings;
    return { text, sub, tone: pct > prev ? 'up' : pct < prev ? 'down' : 'neutral' };
  };
  const insight = getWeeklyInsight();

  // Home insight card: a meal waiting for its after-meal reading (act now), a real
  // insight, or a nudge that teaches the meal -> reading loop. Chosen by the backend.
  const getHighlightCard = () => {
    const h = insightHighlight;
    if (!h) return null;
    if (h.kind === 'check_meal' && h.meal) {
      const checkAt = parseServerDate(h.check_at);
      const when =
        checkAt.getTime() <= Date.now()
          ? 'now'
          : `around ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(checkAt)}`;
      return {
        title: 'Check your glucose',
        text: `Check your glucose ${when} to see how ${h.meal.description} affects you.`,
        link: 'Log ›',
        icon: 'time-outline',
        iconColor: Colors.primary,
        iconBg: '#D5ECEA',
        style: styles.hInsightCardCheck,
        onPress: () => navigation.navigate('LogGlucose', { context: 'after_meal' }),
      };
    }
    if (h.kind === 'insight') {
      return {
        title: 'Your insight',
        text: h.text,
        link: 'See all ›',
        icon: 'bulb',
        iconColor: '#C05621',
        onPress: () => navigation.navigate('GlucoseInsights', { tab: h.tab || 'trends' }),
      };
    }
    return {
      title: 'How it works',
      text: h.text,
      link: 'Log meal ›',
      icon: 'sparkles-outline',
      iconColor: Colors.primary,
      iconBg: '#E8F4F3',
      style: styles.hInsightCardNudge,
      onPress: handleOpenLogMeal,
    };
  };
  const highlightCard = getHighlightCard();
  const greeting = getGreeting();
  const showFreeLine = !hasCurrentFeatureAccess && freeRecipeUsage;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding + 12 }]}
      >
        <View style={[styles.hHeader, { paddingTop: headerPaddingTop + 6 }]}>
          {/* Brand */}
          <View style={styles.hBrandRow}>
            <Image source={require('../../assets/logo.png')} style={styles.hLogo} />
            <View style={{ flex: 1 }}>
              <BrandWordmark size={22} />
              <Text style={styles.hTagline} numberOfLines={1}>Smarter food choices for a healthier you</Text>
            </View>
          </View>

          {/* Greeting + plan status */}
          <View style={styles.hGreetRow}>
            <Text style={styles.hGreeting} numberOfLines={1}>
              {greeting.text}{greetingName ? `, ${greetingName}` : ''}
            </Text>
            <Ionicons name={greeting.icon} size={22} color={greeting.color} style={{ marginLeft: 6 }} />
          </View>
          <Text style={styles.hAsk}>What would you like to eat today?</Text>
          <View style={styles.hBadgeRow}>
            <View style={[styles.hBadge, isAccessCountdown ? styles.hBadgeUrgent : styles.hBadgeSoft]}>
              {isAccessCountdown ? <Ionicons name="time-outline" size={12} color="white" style={{ marginRight: 4 }} /> : null}
              <Text style={[styles.hBadgeText, isAccessCountdown ? { color: 'white' } : null]} numberOfLines={1}>
                {getAccessBadgeLabel()}
              </Text>
            </View>
          </View>

          {/* What should I eat */}
          <View style={styles.hActions}>
            <TouchableOpacity style={[styles.hAction, styles.hActionPrimary]} onPress={handleScanPress} activeOpacity={0.88}>
              <View style={[styles.hActionIcon, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
                <Ionicons name="camera" size={20} color="white" />
              </View>
              <Text style={[styles.hActionText, { color: 'white' }]} numberOfLines={1} adjustsFontSizeToFit>Scan fridge</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.hAction, styles.hActionBlue]} onPress={handleManualInputPress} activeOpacity={0.88}>
              <View style={styles.hActionIcon}>
                <Ionicons name="create" size={20} color="#2B6CB0" />
              </View>
              <Text style={styles.hActionText} numberOfLines={1} adjustsFontSizeToFit>Type foods</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.hAction, styles.hActionOrange]} onPress={handleSurprisePress} activeOpacity={0.88}>
              <View style={styles.hActionIcon}>
                <Ionicons name="sparkles" size={20} color="#DD6B20" />
              </View>
              <Text style={styles.hActionText} numberOfLines={1} adjustsFontSizeToFit>Suggest meal</Text>
            </TouchableOpacity>
          </View>

          {/* Last used ingredients: one line, first 3 + "+N more" */}
          {lastUsed?.items?.length ? (
            <TouchableOpacity style={styles.hLastUsed} onPress={handleLastUsedPress} activeOpacity={0.85}>
              <View style={styles.hLastUsedRow}>
                <Ionicons name="time-outline" size={16} color={Colors.textLight} />
                {lastUsed.items.slice(0, 3).map((item) => (
                  <View key={item} style={styles.hChip}>
                    <Text style={styles.hChipText} numberOfLines={1}>{item}</Text>
                  </View>
                ))}
                {lastUsed.items.length > 3 ? (
                  <View style={[styles.hChip, styles.hChipMore]}>
                    <Text style={[styles.hChipText, { color: Colors.primary }]}>+{lastUsed.items.length - 3} more</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} style={{ marginLeft: 'auto' }} />
              </View>
              <Text style={styles.hLastUsedMeta} numberOfLines={1}>
                Last used · {lastUsed.source === 'text' ? 'typed ingredients' : 'from your fridge scan'}
                {lastUsed.updatedAt ? ` · ${timeAgo(lastUsed.updatedAt)}` : ''}
              </Text>
            </TouchableOpacity>
          ) : null}

          {showFreeLine ? (
            <TouchableOpacity style={styles.hFreeLine} onPress={handleUpgradePaywall} activeOpacity={0.85}>
              <Text style={styles.hFreeText}>
                <Text style={styles.hFreeStrong}>
                  {freeRecipeUsage.remaining} of {freeRecipeUsage.limit}
                </Text>{' '}
                free recipe ideas left this week
              </Text>
              <Text style={styles.hFreeLink}>Upgrade</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {isRefreshing && (
          <View style={styles.refreshRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.refreshText}>Refreshing data...</Text>
          </View>
        )}
        {networkError && (
          <View style={styles.errorBanner}>
            <Ionicons name="cloud-offline-outline" size={18} color={Colors.danger} />
            <Text style={styles.errorText}>{networkError}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={loadUserData}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}

        {foodProfileHasPreferences === true ? null : (
          <View style={styles.hSection}>
            <Pressable
              style={({ pressed }) => [styles.urgentCard, pressed && styles.cardPressed]}
              android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              onPress={() => navigation.navigate('Profile', { screen: 'FoodPreferences' })}
            >
              <View style={styles.urgentIcon}>
                <Ionicons name="alert-circle-outline" size={20} color={Colors.error} />
              </View>
              <View style={styles.urgentText}>
                <Text style={styles.urgentLabel}>Action needed</Text>
                <Text style={styles.urgentTitle} numberOfLines={2}>
                  Personalize your meals (30 seconds)
                </Text>
                <Text style={styles.urgentSnippet} numberOfLines={1}>
                  Get recipes that match your cuisine and goals.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
            </Pressable>
          </View>
        )}

        {/* Track today */}
        <View style={styles.hSection}>
          <View style={styles.hSectionHead}>
            <Text style={styles.hSectionTitle}>Track Today</Text>
            <TouchableOpacity onPress={() => navigation.navigate('FoodLog')} hitSlop={10}>
              <Text style={styles.hSectionLink}>Meal diary ›</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.hCard, styles.hTrackCard]}>
            <View style={styles.hRings}>
              <TouchableOpacity
                style={styles.hRingCol}
                onPress={() => {
                  trackEvent('carb_goal_ring_tapped', { carb_goal_mode: carbGoalMode });
                  // Same as the glucose ring: empty goes straight to logging.
                  navigation.navigate(carbsLoggedToday == null && !mealsLoggedToday ? 'LogMeal' : 'CarbGoal');
                }}
                activeOpacity={0.8}
              >
                <CarbGoalRing carbsLogged={carbsLoggedToday} carbGoal={carbGoalToday} mode={carbGoalMode} size={100} />
                <View style={styles.hRingTitleRow}>
                  <Text style={styles.hRingTitle}>Carbs</Text>
                  <Pressable hitSlop={10} onPress={showCarbGoalDisclaimer}>
                    <Ionicons name="information-circle-outline" size={14} color={Colors.textLight} />
                  </Pressable>
                </View>
                {carbsLoggedToday != null ? (
                  <Text style={styles.hRingValue} numberOfLines={1}>
                    {carbGoalMode === 'none' || !carbGoalToday ? `${carbsLoggedToday}g today` : `${carbsLoggedToday}g of ${carbGoalToday}g`}
                  </Text>
                ) : null}
                {carbsLoggedToday == null ? (
                  mealsLoggedToday ? (
                    <Text style={[styles.hRingSub, { color: Colors.textLight }]} numberOfLines={2}>
                      {mealsLoggedToday} meal{mealsLoggedToday === 1 ? '' : 's'}, no carb count
                    </Text>
                  ) : (
                    <Text style={[styles.hRingSub, { color: Colors.primary }]}>Log a meal</Text>
                  )
                ) : (
                  <Text
                    style={[styles.hRingSub, { color: getCarbGoalRingColor(carbsLoggedToday, carbGoalToday, carbGoalMode) }]}
                    numberOfLines={2}
                  >
                    {carbGoalSubtitle || carbGoalTitle}
                  </Text>
                )}
              </TouchableOpacity>

              {/* With a reading today the ring opens the glucose details; empty, it goes straight to logging. */}
              <TouchableOpacity
                style={styles.hRingCol}
                onPress={lastReading ? () => navigation.navigate('GlucoseInsights', { tab: 'trends' }) : handleOpenLogGlucose}
                activeOpacity={0.8}
              >
                <GlucoseRangeRing today={glucose?.today} size={100} />
                <Text style={[styles.hRingTitle, { marginTop: 8 }]}>Glucose</Text>
                {lastReading ? (
                  <>
                    <Text style={styles.hRingValue} numberOfLines={1}>
                      {formatGlucose(lastReading.value_mg_dl, glucoseUnit)}
                    </Text>
                    <Text style={[styles.hRingSub, { color: lastMeta.color }]} numberOfLines={1}>
                      {describeReading(lastReading, glucoseUnit)}
                    </Text>
                  </>
                ) : (
                  <Text style={[styles.hRingSub, { color: Colors.primary }]}>Log a reading</Text>
                )}
              </TouchableOpacity>
            </View>

            {lastReading && SAFETY_LINES[lastReading.status] ? (
              <View style={styles.hSafety}>
                <Ionicons name="alert-circle" size={16} color="#C53030" />
                <Text style={styles.hSafetyText}>{SAFETY_LINES[lastReading.status]}</Text>
              </View>
            ) : null}

            <View
              style={[
                styles.hInsight,
                insight.tone === 'up' && styles.hInsightUp,
                insight.tone === 'down' && styles.hInsightDown,
              ]}
            >
              <Ionicons
                name={insight.tone === 'up' ? 'trending-up' : insight.tone === 'down' ? 'trending-down' : 'analytics-outline'}
                size={16}
                color={insight.tone === 'up' ? Colors.success : insight.tone === 'down' ? '#B7791F' : Colors.primary}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.hInsightText} numberOfLines={2}>{insight.text}</Text>
                {insight.sub ? <Text style={styles.hInsightSub}>{insight.sub}</Text> : null}
              </View>
              <TouchableOpacity onPress={handleOpenGlucoseTargets} hitSlop={8}>
                <Text style={styles.hInsightLink}>Targets</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.hTiles}>
              {[
                // One distinct hue per action: green (food), blue (glucose), orange (camera), violet (barcode).
                { label: 'Log Meal', sub: 'What you ate', icon: 'restaurant', ...TILE_THEMES.green, onPress: handleOpenLogMeal },
                { label: 'Log Glucose', sub: 'Your reading', icon: 'water', ...TILE_THEMES.blue, onPress: handleOpenLogGlucose },
                { label: 'Snap a Meal', sub: 'See the carbs', icon: 'camera', ...TILE_THEMES.orange, onPress: handleOpenPhotoScan },
                { label: 'Scan Barcode', sub: 'Free verdict', icon: 'barcode-outline', ...TILE_THEMES.violet, onPress: handleOpenBarcodeScan },
              ].map((tile) => (
                <TouchableOpacity
                  key={tile.label}
                  style={[styles.hTileShell, { borderColor: tile.border, shadowColor: tile.accent }]}
                  onPress={tile.onPress}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={tile.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={[styles.hTile, compactTiles && styles.hTileCompact]}
                  >
                    <View style={[styles.hTileIcon, { backgroundColor: tile.accent }]}>
                      <Ionicons name={tile.icon} size={17} color="white" />
                    </View>
                    <View style={compactTiles ? styles.hTileTextCompact : { flex: 1 }}>
                      <Text style={styles.hTileTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {tile.label}
                      </Text>
                      <Text style={[styles.hTileSub, { color: tile.subColor }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                        {tile.sub}
                      </Text>
                    </View>
                  </LinearGradient>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {highlightCard ? (
            <TouchableOpacity
              style={[styles.hInsightCard, highlightCard.style]}
              onPress={highlightCard.onPress}
              activeOpacity={0.85}
            >
              <View style={[styles.hInsightBulb, highlightCard.iconBg && { backgroundColor: highlightCard.iconBg }]}>
                <Ionicons name={highlightCard.icon} size={18} color={highlightCard.iconColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.hInsightCardTitle, { color: highlightCard.iconColor }]}>{highlightCard.title}</Text>
                <Text style={styles.hInsightCardText}>{highlightCard.text}</Text>
              </View>
              <Text style={styles.hSectionLink}>{highlightCard.link}</Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* 3 picks */}
        {isFetchingRecipes || suggestedRecipes.length ? (
        <View style={styles.hSection}>
          <View style={styles.hSectionHead}>
            <Text style={styles.hSectionTitle}>3 Picks for You</Text>
            <TouchableOpacity onPress={handleShuffleSuggestions} disabled={isFetchingRecipes} hitSlop={10} style={styles.hShuffle}>
              {isFetchingRecipes ? <ActivityIndicator size="small" color={Colors.primary} /> : <Ionicons name="shuffle" size={16} color={Colors.primary} />}
              <Text style={styles.hSectionLink}>Shuffle</Text>
            </TouchableOpacity>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hCardsRow}>
            {isFetchingRecipes && suggestedRecipes.length === 0
              ? Array.from({ length: 3 }).map((_, idx) => (
                  <View key={`skeleton-${idx}`} style={styles.hPick}>
                    <View style={[styles.hPickImage, { backgroundColor: Colors.border }]} />
                    <View style={styles.hPickBody}>
                      <View style={styles.recipeSkeletonLine} />
                      <View style={styles.recipeSkeletonLineShort} />
                    </View>
                  </View>
                ))
              : suggestedRecipes.map((recipe, index) => {
                  const carbs = getRecipeCarbs(recipe);
                  const lowCarb = carbs != null && carbs <= 20;
                  const timeValue = getRecipeTimeValue(recipe);
                  const imageUrl = recipeImagesEnabled ? getRecipeImageUrl(recipe) || recipe.image_url : '';
                  return (
                    <TouchableOpacity
                      key={recipe.id || `${recipe.name || 'recipe'}-${index}`}
                      style={styles.hPick}
                      onPress={() => handleViewRecipeDetail(recipe)}
                      activeOpacity={0.9}
                    >
                      <View>
                        {imageUrl ? (
                          <Image source={{ uri: imageUrl }} style={styles.hPickImage} />
                        ) : (
                          <View style={[styles.hPickImage, styles.hPickImageEmpty]}>
                            <Ionicons name="restaurant-outline" size={26} color={Colors.primary} />
                          </View>
                        )}
                        {carbs != null ? (
                          <View style={[styles.hLabel, lowCarb ? styles.hLabelLow : styles.hLabelBal]}>
                            <Text style={[styles.hLabelText, { color: lowCarb ? Colors.success : '#2B6CB0' }]}>
                              {lowCarb ? 'Low carb' : 'Balanced'}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <View style={styles.hPickBody}>
                        <Text style={styles.hPickTitle} numberOfLines={2}>
                          {getFeelingBadge(recipe) ? `${getFeelingBadge(recipe).emoji} ` : ''}
                          {recipe.name || recipe.title}
                        </Text>
                        <View style={styles.hPickMeta}>
                          {timeValue !== '--' ? (
                            <Text style={styles.hPickMetaText}>
                              <Ionicons name="time-outline" size={12} color={Colors.textLight} /> {timeValue} min
                            </Text>
                          ) : null}
                          {carbs != null ? <Text style={styles.hPickCarbs}>{carbs}g carbs</Text> : null}
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
          </ScrollView>
        </View>
        ) : null}

        {/* Smart move */}
        <View style={styles.hSection}>
          <View style={styles.hSectionHead}>
            <Text style={styles.hSectionTitle}>Today's Smart Move</Text>
            {hasChallenge && streakDays > 0 ? (
              <TouchableOpacity style={styles.hStreak} onPress={handleOpenWeeklyRecap} activeOpacity={0.8}>
                <Ionicons name="flame" size={14} color="#C05621" />
                <Text style={styles.hStreakText}>{streakDays} day streak</Text>
                {showWeeklyRecapNewDot ? <View style={styles.newDot} /> : null}
              </TouchableOpacity>
            ) : null}
          </View>
          <View style={styles.hCard}>
            {hasChallenge ? (
              <>
                <TouchableOpacity style={styles.hMoveRow} onPress={handleOpenChallenge} activeOpacity={0.88}>
                  <View style={[styles.hMoveIcon, { backgroundColor: '#FFF1E6' }]}>
                    <Ionicons
                      name={dailyChallenge.completed_today ? 'checkmark-circle' : 'trophy'}
                      size={20}
                      color={dailyChallenge.completed_today ? Colors.success : '#C05621'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.hMoveKicker, { color: '#C05621' }]}>
                      {dailyChallenge.completed_today ? 'Challenge complete' : `Challenge · ${challengeCompleted}/${challengeTotal} done`}
                    </Text>
                    <Text style={styles.hMoveTitle} numberOfLines={2}>
                      {(dailyChallenge.tasks.find((t) => !t.completed) || dailyChallenge.tasks[0])?.text || "Today's challenge"}
                    </Text>
                  </View>
                  <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
                </TouchableOpacity>
                <View style={styles.hDivider} />
              </>
            ) : null}
            <TouchableOpacity style={styles.hMoveRow} onPress={handleOpenTip} activeOpacity={0.88}>
              <View style={[styles.hMoveIcon, { backgroundColor: '#E8F4F3' }]}>
                <Ionicons name="bulb" size={20} color={Colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.hMoveKicker, { color: Colors.primary }]}>Food tip</Text>
                <Text style={styles.hMoveTitle} numberOfLines={2}>{todayTip.title}</Text>
                <Text style={styles.hMoveBody} numberOfLines={2}>
                  {todayTip.tip || todayTip.body || 'Small daily actions to support steadier blood sugar.'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Tools */}
        <View style={styles.hSection}>
          <View style={styles.hSectionHead}>
            <Text style={styles.hSectionTitle}>Food Tools</Text>
          </View>
          <View style={styles.hTools}>
            <TouchableOpacity style={[styles.hTool, { backgroundColor: '#FFF1E6' }]} onPress={handleOpenSwaps} activeOpacity={0.88}>
              <View style={styles.hToolIcon}>
                <Ionicons name="swap-horizontal" size={20} color="#DD6B20" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.hToolTitle}>Food Swaps</Text>
                <Text style={styles.hToolSub} numberOfLines={2}>Find healthier alternatives</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.hTool, { backgroundColor: '#E7F4E8' }]} onPress={handleOpenShoppingList} activeOpacity={0.88}>
              <View style={styles.hToolIcon}>
                <Ionicons name="cart" size={20} color={Colors.success} />
                {showShoppingListNewDot ? <View style={styles.newDot} /> : null}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.hToolTitle}>Shopping List</Text>
                <Text style={styles.hToolSub} numberOfLines={2}>Save ingredients, shop easily</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Recent recipes */}
        <View style={styles.hSection}>
          <View style={styles.hSectionHead}>
            <Text style={styles.hSectionTitle}>Recent Recipes</Text>
            {recentRecipes.length ? (
              <TouchableOpacity onPress={handleViewRecentRecipes} hitSlop={10}>
                <Text style={styles.hSectionLink}>See all ›</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {recentRecipes.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.hCardsRow}>
              {recentRecipes.slice(0, 6).map((recipe, index) => {
                const imageUrl = recipeImagesEnabled ? getRecipeImageUrl(recipe) : '';
                const timeValue = getRecipeTimeValue(recipe);
                return (
                  <TouchableOpacity
                    key={recipe.id || `${recipe.name || 'recent'}-${index}`}
                    style={styles.hRecent}
                    onPress={() => handleViewRecipeDetail(recipe)}
                    activeOpacity={0.9}
                  >
                    {imageUrl ? (
                      <Image source={{ uri: imageUrl }} style={styles.hRecentImage} />
                    ) : (
                      <View style={[styles.hRecentImage, styles.hPickImageEmpty]}>
                        <Ionicons name="restaurant-outline" size={22} color={Colors.primary} />
                      </View>
                    )}
                    <Text style={styles.hRecentTitle} numberOfLines={2}>{recipe.name || recipe.title}</Text>
                    {timeValue !== '--' ? <Text style={styles.hPickMetaText}>{timeValue} min</Text> : null}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          ) : (
            <Text style={styles.hEmpty}>
              {isFetchingRecipes ? 'Loading…' : 'Your recipes will show here after your first scan or search.'}
            </Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.brandCream,
  },
  // Redesigned home: header, actions, track today, picks, tools, recent.
  hHeader: { paddingHorizontal: 18 },
  hBrandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hLogo: { width: 44, height: 44 },
  hTagline: { fontSize: 11.5, color: Colors.textLight, marginTop: 1 },
  hGreetRow: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  hGreeting: { fontSize: 24, fontWeight: '900', color: Colors.brandNavy, flexShrink: 1 },
  hAsk: { fontSize: 15.5, color: '#4A5568', marginTop: 2 },
  hBadgeRow: { flexDirection: 'row', marginTop: 8 },
  hBadge: { flexDirection: 'row', alignItems: 'center', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
  hBadgeUrgent: { backgroundColor: '#C53030', borderColor: '#C53030' },
  hBadgeSoft: { backgroundColor: '#E8F4F3', borderColor: '#CDE7E5' },
  hBadgeText: { fontSize: 11.5, fontWeight: '900', color: Colors.primary },
  hActions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  hAction: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 6, borderWidth: 1 },
  hActionPrimary: { backgroundColor: Colors.primary, borderColor: Colors.primary, shadowColor: Colors.primary, shadowOpacity: 0.25, shadowRadius: 10, shadowOffset: { width: 0, height: 6 }, elevation: 4 },
  hActionBlue: { backgroundColor: '#E8F1FB', borderColor: '#D3E4F7' },
  hActionOrange: { backgroundColor: '#FFF1E6', borderColor: '#FBDCC4' },
  hActionIcon: { width: 36, height: 36, borderRadius: 11, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  hActionText: { fontSize: 13.5, fontWeight: '800', color: Colors.brandNavy },
  hLastUsed: { marginTop: 10, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: 'rgba(232,244,243,0.75)', borderWidth: 1, borderColor: '#DCEDEB' },
  hLastUsedRow: { flexDirection: 'row', alignItems: 'center', gap: 6, overflow: 'hidden' },
  hChip: { backgroundColor: 'white', borderWidth: 1, borderColor: '#CDE7E5', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, maxWidth: 92 },
  hChipMore: { backgroundColor: '#E8F4F3' },
  hChipText: { fontSize: 12.5, fontWeight: '700', color: Colors.brandNavy },
  hLastUsedMeta: { fontSize: 11.5, color: Colors.textLight, marginTop: 5, marginLeft: 22 },
  hFreeLine: { marginTop: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 14, paddingVertical: 9, paddingHorizontal: 12, backgroundColor: 'white', borderWidth: 1, borderColor: '#E9ECE4' },
  hFreeText: { fontSize: 12.5, color: Colors.textLight, flexShrink: 1 },
  hFreeStrong: { fontWeight: '900', color: Colors.brandNavy },
  hFreeLink: { fontSize: 12.5, fontWeight: '900', color: Colors.primary, marginLeft: 8 },
  hSection: { paddingHorizontal: 18, marginTop: 22 },
  hSectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  hSectionTitle: { fontSize: 19, fontWeight: '900', color: Colors.brandNavy },
  hSectionLink: { fontSize: 13.5, fontWeight: '800', color: Colors.primary },
  hShuffle: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hCard: { backgroundColor: 'white', borderRadius: 20, borderWidth: 1, borderColor: '#E9ECE4', padding: 14 },
  hTrackCard: { marginHorizontal: -10, paddingHorizontal: 12, paddingVertical: 16 },
  hRings: { flexDirection: 'row', gap: 8 },
  hRingCol: { flex: 1, alignItems: 'center' },
  hRingTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8 },
  hRingTitle: { fontSize: 14, fontWeight: '900', color: Colors.brandNavy },
  hRingValue: { fontSize: 13.5, fontWeight: '900', color: Colors.brandNavy, marginTop: 2 },
  hRingSub: { fontSize: 12, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  hSafety: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, padding: 10, borderRadius: 12, backgroundColor: '#FFF5F5', borderWidth: 1, borderColor: '#FED7D7' },
  hSafetyText: { flex: 1, fontSize: 12.5, color: '#9B2C2C', fontWeight: '600' },
  hInsightCard: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 12, padding: 14, borderRadius: 18, backgroundColor: '#FFF8EE', borderWidth: 1, borderColor: '#FBE3C4' },
  hInsightCardNudge: { backgroundColor: 'white', borderColor: '#E9ECE4' },
  hInsightCardCheck: { backgroundColor: '#E8F4F3', borderColor: '#BFE0DD' },
  hInsightBulb: { width: 36, height: 36, borderRadius: 12, backgroundColor: '#FFEBD2', alignItems: 'center', justifyContent: 'center' },
  hInsightCardTitle: { fontSize: 12, fontWeight: '900', color: '#C05621', textTransform: 'uppercase', letterSpacing: 0.4 },
  hInsightCardText: { fontSize: 13.5, fontWeight: '700', color: Colors.brandNavy, marginTop: 2, lineHeight: 19 },
  hInsight: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: '#F1F5F9' },
  hInsightUp: { backgroundColor: '#E7F4E8' },
  hInsightDown: { backgroundColor: '#FFF8E6' },
  hInsightText: { fontSize: 12.5, color: Colors.brandNavy, fontWeight: '700' },
  hInsightSub: { fontSize: 11.5, color: Colors.textLight, marginTop: 1 },
  hInsightLink: { fontSize: 12.5, fontWeight: '900', color: Colors.primary },
  hTiles: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: 8, marginTop: 12 },
  hTileShell: {
    width: '48.8%',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    backgroundColor: 'white',
  },
  hTile: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 11 },
  hTileCompact: { flexDirection: 'column', alignItems: 'flex-start', gap: 7, padding: 11 },
  hTileTextCompact: { alignSelf: 'stretch' },
  hTileIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  hTileTitle: { fontSize: 13.5, fontWeight: '800', color: Colors.brandNavy },
  hTileSub: { fontSize: 11, fontWeight: '700', marginTop: 1 },
  hCardsRow: { gap: 10, paddingRight: 18 },
  hPick: { width: 168, backgroundColor: 'white', borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: '#E9ECE4' },
  hPickImage: { width: '100%', height: 108 },
  hPickImageEmpty: { backgroundColor: '#E8F4F3', alignItems: 'center', justifyContent: 'center' },
  hLabel: { position: 'absolute', left: 8, bottom: 8, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 },
  hLabelLow: { backgroundColor: '#E7F4E8' },
  hLabelBal: { backgroundColor: '#E8F1FB' },
  hLabelText: { fontSize: 11, fontWeight: '800' },
  hPickBody: { padding: 10, gap: 6 },
  hPickTitle: { fontSize: 14, fontWeight: '800', color: Colors.brandNavy, minHeight: 36 },
  hPickMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hPickMetaText: { fontSize: 12, color: Colors.textLight },
  hPickCarbs: { fontSize: 12, fontWeight: '800', color: Colors.success },
  hStreak: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  hStreakText: { fontSize: 13, fontWeight: '800', color: '#C05621' },
  hMoveRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  hMoveIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  hMoveKicker: { fontSize: 11, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.4 },
  hMoveTitle: { fontSize: 14.5, fontWeight: '800', color: Colors.brandNavy, marginTop: 2 },
  hMoveBody: { fontSize: 12.5, color: Colors.textLight, marginTop: 2 },
  hDivider: { height: 1, backgroundColor: '#E9ECE4', marginVertical: 12 },
  hTools: { flexDirection: 'row', gap: 10 },
  hTool: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 18, padding: 12 },
  hToolIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  hToolTitle: { fontSize: 14, fontWeight: '800', color: Colors.brandNavy },
  hToolSub: { fontSize: 11.5, color: Colors.textLight, marginTop: 2 },
  hRecent: { width: 122 },
  hRecentImage: { width: 122, height: 94, borderRadius: 16 },
  hRecentTitle: { fontSize: 13, fontWeight: '800', color: Colors.brandNavy, marginTop: 6 },
  hEmpty: { fontSize: 13, color: Colors.textLight },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.textLight,
  },
  scrollContent: {
    paddingTop: 0,
  },
  heroHeader: {
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 8,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 10,
  },
  quickActionsRow: {
    gap: 10,
    paddingTop: 12,
    paddingBottom: 6,
  },
  quickActionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(255,255,255,0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.75)',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  quickActionChipEatNow: {
    backgroundColor: Colors.accent,
    borderColor: 'transparent',
  },
  quickActionChipSwaps: {
    backgroundColor: Colors.secondary,
    borderColor: 'transparent',
  },
  quickActionText: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
  },
  quickActionTextOnDark: {
    color: 'white',
  },
  heroCtaWrap: {
    marginTop: 14,
    gap: 10,
    paddingBottom: 6,
  },
  getRecipesCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.7)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 4,
  },
  getRecipesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroPrimaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  getRecipesTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
  },
  getRecipesSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textLight,
  },
  entryChipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  entryChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
    borderRadius: 14,
    backgroundColor: `${Colors.primary}10`,
  },
  entryChipText: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  filterChipRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: Colors.textLight,
  },
  heroUsageWrap: {
    borderRadius: 18,
    padding: 14,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  heroUsageTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  heroUsageLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.78)',
  },
  heroUsageCount: {
    fontSize: 12,
    fontWeight: '900',
    color: 'white',
  },
  heroUsageBody: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.88)',
  },
  heroUpgradeButton: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 11,
    backgroundColor: Colors.accent,
  },
  heroUpgradeText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
  },
  refreshRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
    gap: 8,
  },
  refreshText: {
    fontSize: 12,
    color: Colors.textLight,
    fontWeight: '500',
  },
  heroGreetingBlock: {
    flex: 1,
    paddingRight: 12,
  },
  greeting: {
    fontSize: 23,
    lineHeight: 29,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.96)',
    letterSpacing: 0,
  },
  greetingHey: {
    fontSize: 24,
    fontWeight: '900',
    color: 'white',
  },
  subGreetingRow: {
    marginTop: 5,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  subGreeting: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '800',
    color: 'rgba(255,255,255,0.84)',
  },
  accessBadge: {
    maxWidth: '62%',
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.24)',
  },
  accessBadgeUrgent: {
    backgroundColor: '#C53030',
    borderColor: 'rgba(255,255,255,0.35)',
  },
  accessBadgeText: {
    flexShrink: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '900',
    color: 'white',
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  heroStatsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  heroStatPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 58,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  heroStatIcon: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#c8f5b8',
  },
  heroStatText: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  heroStatValue: {
    fontSize: 18,
    fontWeight: '900',
    color: 'white',
  },
  heroStatLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.74)',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: `${Colors.danger}12`,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 8,
  },
  errorText: {
    flex: 1,
    fontSize: 13,
    color: Colors.danger,
    fontWeight: '600',
  },
  retryButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: `${Colors.danger}20`,
  },
  retryText: {
    fontSize: 12,
    color: Colors.danger,
    fontWeight: '600',
  },
  counterCard: {
    backgroundColor: Colors.primary,
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  counterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  counterTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
  },
  counterSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  counterIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  progressBar: {
    height: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: 'white',
    borderRadius: 3,
  },
  upgradePrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    backgroundColor: Colors.error,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  upgradeText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    marginRight: 6,
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  streakBadge: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: `${Colors.accent}14`,
  },
  streakBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.accent,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  sectionSubtitle: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '600',
  },
  viewAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: `${Colors.primary}12`,
  },
  viewAllText: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.primary,
  },
  cardPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  tipCard: {
    marginTop: 12,
    backgroundColor: `${Colors.primary}12`,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tipIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipText: { flex: 1 },
  tipLabel: { fontSize: 12, fontWeight: '900', color: Colors.primary, textTransform: 'uppercase' },
  tipTitle: { marginTop: 2, fontSize: 14, fontWeight: '800', color: Colors.text },
  tipSnippet: { marginTop: 4, fontSize: 12, fontWeight: '700', color: Colors.textLight },
  smartMoveCard: {
    marginTop: 12,
    backgroundColor: Colors.surface,
    borderRadius: 20,
    padding: 10,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 3,
  },
  smartMoveMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 12,
    backgroundColor: `${Colors.primary}08`,
  },
  smartMoveMainSecondary: {
    marginTop: 8,
  },
  smartMoveIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartMoveText: {
    flex: 1,
  },
  smartMoveLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: Colors.primary,
    textTransform: 'uppercase',
  },
  smartMoveTitle: {
    marginTop: 3,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: '900',
    color: Colors.text,
  },
  smartMoveSnippet: {
    marginTop: 5,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: Colors.textLight,
  },
  trackCard: {
    borderRadius: 22,
    padding: 14,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  scanButtonsRow: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  scanButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    height: 50,
    borderRadius: 16,
    paddingHorizontal: 10,
    backgroundColor: Colors.primary,
  },
  scanButtonText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: 'white',
  },
  trackButtonRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  trackButton: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    backgroundColor: `${Colors.primary}0F`,
    borderWidth: 1,
    borderColor: `${Colors.primary}24`,
  },
  trackButtonTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  trackButtonTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.primary,
  },
  carbGoalRow: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 16,
    backgroundColor: Colors.background,
  },
  carbGoalTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: Colors.text,
  },
  carbGoalSubtitle: {
    marginTop: 2,
    fontSize: 10.5,
    fontWeight: '700',
  },
  spikeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: `${Colors.warning}18`,
  },
  spikeBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: Colors.warning,
  },
  viewLogBadge: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: `${Colors.secondary}14`,
    borderWidth: 1,
    borderColor: `${Colors.secondary}28`,
  },
  viewLogBadgeText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: Colors.secondary,
  },
  smartChallengeRow: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(237, 137, 54, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(237, 137, 54, 0.18)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  smartChallengeIcon: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: 'rgba(237, 137, 54, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  smartChallengeText: {
    flex: 1,
  },
  smartChallengeTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: Colors.text,
  },
  smartChallengeMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textLight,
  },
  urgentCard: {
    marginTop: 12,
    backgroundColor: '#FFF5F5',
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  urgentIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FED7D7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  urgentText: { flex: 1 },
  urgentLabel: { fontSize: 12, fontWeight: '900', color: Colors.error, textTransform: 'uppercase' },
  urgentTitle: { marginTop: 2, fontSize: 14, fontWeight: '900', color: Colors.text },
  urgentSnippet: { marginTop: 4, fontSize: 12, fontWeight: '700', color: Colors.textLight },
  challengeCard: {
    marginTop: 12,
    backgroundColor: `${Colors.primary}10`,
    borderRadius: 16,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  challengeIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: `${Colors.primary}14`,
    alignItems: 'center',
    justifyContent: 'center',
  },
  challengeText: { flex: 1 },
  challengeRows: { marginTop: 10, gap: 6 },
  challengeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  challengeRowText: { flex: 1, fontSize: 12, color: Colors.textLight, fontWeight: '700' },
  toolsRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  toolTile: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  newDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: Colors.danger,
    borderWidth: 1.5,
    borderColor: Colors.surface,
  },
  toolTileIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolTileLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  seeAllText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  recipesScroll: {
    marginLeft: -20,
    paddingLeft: 20,
  },
  actionCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  actionCardPrimary: {
    backgroundColor: `${Colors.primary}08`,
  },
  actionCardSecondary: {
    backgroundColor: `${Colors.secondary}08`,
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: 12,
    bottom: 12,
    width: 4,
    borderTopRightRadius: 6,
    borderBottomRightRadius: 6,
    opacity: 0.9,
  },
  actionContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionIcon: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  actionText: {
    flex: 1,
  },
  actionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
  },
  actionDescription: {
    fontSize: 14,
    color: Colors.textLight,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: `${Colors.primary}08`,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginTop: 4,
    position: 'relative',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
  },
  recentRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  recentRowText: {
    fontSize: 15,
    color: Colors.text,
    fontWeight: '600',
  },
  recentRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  recentRowCount: {
    fontSize: 12,
    color: Colors.textLight,
    fontWeight: '600',
  },
  recipeCard: {
    width: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginRight: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  recipeImage: {
    height: 140,
    width: '100%',
  },
  recipeImagePlaceholder: {
    height: 140,
    backgroundColor: Colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: {
    padding: 16,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    marginBottom: 8,
    flexWrap: 'nowrap',
  },
  recipeSpacer: {
    flex: 1,
  },
  badge: {
    backgroundColor: `${Colors.success}15`,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 1,
  },
  badgeText: {
    color: Colors.success,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
  },
  feelingBadge: {
    marginLeft: 6,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 6,
    backgroundColor: `${Colors.accent}15`,
  },
  feelingBadgeText: {
    fontSize: 12,
  },
  recipeTime: {
    fontSize: 14,
    color: Colors.textLight,
    flexShrink: 0,
    minWidth: 48,
  },
  recipeTimeUnit: {
    fontSize: 12,
    color: Colors.textLight,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 4,
    lineHeight: 22,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  recipeMetaValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  recipeMetaDivider: {
    marginHorizontal: 8,
    fontSize: 14,
    color: Colors.textMuted,
  },
  recipeCal: {
    color: Colors.accent,
  },
  recipePro: {
    color: Colors.primary,
  },
  recipeFib: {
    color: Colors.secondary,
  },
  recipeSkeletonCard: {
    width: 280,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginRight: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recipeSkeletonImage: {
    height: 140,
    width: '100%',
    backgroundColor: Colors.border,
  },
  recipeSkeletonInfo: {
    padding: 16,
    gap: 10,
  },
  recipeSkeletonLine: {
    height: 12,
    borderRadius: 8,
    backgroundColor: Colors.border,
    width: '100%',
  },
  recipeSkeletonLineShort: {
    height: 12,
    borderRadius: 8,
    backgroundColor: Colors.border,
    width: '62%',
  },
  recentMiniCard: {
    width: 160,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    marginRight: 14,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  recentMiniThumb: {
    width: '100%',
    height: 96,
    backgroundColor: Colors.border,
  },
  recentMiniTextWrap: {
    padding: 12,
  },
  recentMiniTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: Colors.text,
    lineHeight: 18,
  },
  emptyInline: {
    paddingVertical: 10,
    paddingHorizontal: 6,
  },
  emptyInlineText: {
    fontSize: 13,
    fontWeight: '700',
    color: Colors.textLight,
  },
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    marginTop: 22,
    marginHorizontal: 20,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 6,
  },
  shuffleButtonDisabled: {
    opacity: 0.7,
  },
  shuffleText: {
    marginLeft: 10,
    color: 'white',
    fontWeight: '700',
    fontSize: 15,
  },
  devResetButton: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    backgroundColor: '#FF3B30',
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
});
