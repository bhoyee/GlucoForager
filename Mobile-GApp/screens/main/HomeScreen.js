// screens/main/HomeScreen.js - UPDATED PRODUCTION VERSION
import React, { useState, useCallback, useMemo, useRef } from 'react';
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
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Gradients } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { LinearGradient } from 'expo-linear-gradient';
import { getRecipeImageSettings } from '../../utils/recipeImageSettings';
import {
  getCachedRecipeImageUrl,
  isDurableRecipeImageUrl,
  isPlaceholderRecipeImageUrl,
  setCachedRecipeImageUrl,
} from '../../utils/recipeImageCache';
import { getTodayTip } from '../../utils/todayTips';
import { scheduleDailyPlanNotifications } from '../../utils/mealReminders';

export default function HomeScreen() {
  const navigation = useNavigation();
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
  const todayTip = useMemo(() => {
    if (serverTodayTip?.title && (serverTodayTip?.tip || serverTodayTip?.body)) return serverTodayTip;
    return getTodayTip(new Date(), { blockedTipIds });
  }, [blockedTipIds, serverTodayTip]);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const premiumPromptShownRef = useRef(false);
  const [networkError, setNetworkError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [userStats, setUserStats] = useState({
    recipesGenerated: 0,
    scansToday: 0,
    favoritesSaved: 0,
  });
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

    if (nextAccessStatus === 'expired' && !premiumPromptShownRef.current) {
      premiumPromptShownRef.current = true;
      setTimeout(() => {
        openPremiumPaywall();
      }, 500);
    }

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
          ? 'Grace active'
          : 'Trial active';
    }
    if (currentAccessStatus === 'expired') return 'Start your 7-day free trial';
    return 'Premium required';
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

  const handleOpenEatNow = () => navigation.navigate('EatNow');
  const handleOpenSwaps = () => navigation.navigate('CarbSwaps');
  const handleOpenChallenge = () => navigation.navigate('Challenge');
  const handleOpenTip = () => navigation.navigate('TodayTip', { tip: todayTip });

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
      const allowed = hasActiveAccess(data);
      setUserIsPremium(isPremium);
      setAccessStatus(data.access_status || (allowed ? 'premium' : 'expired'));
      setTrialDaysLeft(data.trial_days_left ?? null);

      if (allowed) {
        if (source === 'manual') {
          navigation.navigate('ManualInput');
        } else {
          // Navigate to Scan tab
          navigation.navigate('Scan', { screen: 'ScanMain' });
        }
      } else {
        Alert.alert(
          'Start your 7-day free trial',
          data?.detail?.message || 'Start your 7-day free trial to use scan and recipe generation.',
          [
            { text: 'OK', style: 'cancel' },
            { 
              text: 'Start Trial',
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

  const getDayGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour <= 11) return 'Good morning';
    if (hour >= 12 && hour <= 16) return 'Good afternoon';
    if (hour >= 17 && hour <= 21) return 'Good evening';
    return 'Good night';
  };

  const getMealLabel = () => {
    const t = getMealType();
    if (t === 'breakfast') return 'Breakfast';
    if (t === 'lunch') return 'Lunch';
    if (t === 'dinner') return 'Dinner';
    return 'Snack';
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

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >
      <LinearGradient colors={[Colors.primaryDark, Colors.primary, Colors.primaryLight]} style={[styles.heroHeader, { paddingTop: headerPaddingTop }]}>
        <View style={styles.heroTopRow}>
          <View>
            <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="tail">
              {getDayGreeting()}
              {greetingName ? (
                <>
                  {', '}
                  <Text style={styles.greetingName}>{greetingName}</Text>
                </>
              ) : null}
            </Text>
            <Text style={styles.subGreeting}>
              {`It's ${getMealLabel()} time • ${getAccessLabel()}`}
            </Text>
          </View>
          <TouchableOpacity style={styles.notificationButton} onPress={() => navigation.navigate('Profile')}>
            <Ionicons name="person-outline" size={22} color="white" />
          </TouchableOpacity>
        </View>

        <View style={styles.heroStatsRow}>
          <TouchableOpacity style={styles.heroStatPill} onPress={handleViewRecipeHistory} activeOpacity={0.86}>
            <View style={styles.heroStatIcon}>
              <Ionicons name="restaurant-outline" size={20} color={Colors.primaryDark} />
            </View>
            <View style={styles.heroStatText}>
              <Text style={styles.heroStatValue}>{userStats.recipesGenerated}</Text>
              <Text style={styles.heroStatLabel}>recipes made</Text>
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.heroStatPill} onPress={() => navigation.navigate('Favorites')} activeOpacity={0.86}>
            <View style={styles.heroStatIcon}>
              <Ionicons name="bookmark-outline" size={21} color={Colors.primaryDark} />
            </View>
            <View style={styles.heroStatText}>
              <Text style={styles.heroStatValue}>{userStats.favoritesSaved}</Text>
              <Text style={styles.heroStatLabel}>saved</Text>
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.heroCtaWrap}>
          <View style={styles.heroPrimaryCta}>
            <View style={styles.heroPrimaryCtaContent}>
              <View style={styles.heroPrimaryIcon}>
                <Ionicons name="camera-outline" size={22} color="white" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroCtaTitle}>Scan your fridge</Text>
                <Text style={styles.heroCtaSub} numberOfLines={1}>
                  {getAccessLabel()}
                </Text>
              </View>
              <TouchableOpacity style={styles.heroCtaButton} onPress={handleScanPress} activeOpacity={0.9}>
                <Text style={styles.heroCtaButtonText}>Start</Text>
                <Ionicons name="arrow-forward" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>

          <Pressable
            style={({ pressed }) => [styles.heroSecondaryCta, pressed && styles.cardPressed]}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            onPress={handleManualInputPress}
          >
            <View style={styles.heroSecondaryLeft}>
              <View style={[styles.heroCtaIcon, { backgroundColor: `${Colors.secondary}20` }]}>
                <Ionicons name="create-outline" size={20} color={Colors.secondary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroSecondaryTitle}>Type ingredients</Text>
                <Text style={styles.heroSecondarySub} numberOfLines={1}>
                  {getAccessLabel()}
                </Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
          </Pressable>
          {!hasCurrentFeatureAccess ? (
            <View style={styles.heroUsageWrap}>
              <View style={styles.heroUsageTop}>
                <Text style={styles.heroUsageLabel}>Access required</Text>
                <Text style={styles.heroUsageCount}>7 days free</Text>
              </View>
              <Text style={styles.heroUsageBody}>
                Start your free trial to scan ingredients, type ingredients, and generate diabetes-friendly recipes.
              </Text>
              <TouchableOpacity style={styles.heroUpgradeButton} onPress={handleUpgradePaywall} activeOpacity={0.9}>
                <Text style={styles.heroUpgradeText}>Start 7-day trial</Text>
                <Ionicons name="arrow-forward" size={15} color="white" />
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      </LinearGradient>
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
          <View style={styles.section}>
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

        {/* Daily smart move */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Today's smart move</Text>
          <Text style={styles.sectionSubtitle}>One practical nudge for steadier choices today.</Text>

          <View style={styles.smartMoveCard}>
            <TouchableOpacity style={styles.smartMoveMain} onPress={handleOpenTip} activeOpacity={0.9}>
              <View style={styles.smartMoveIcon}>
                <Ionicons name="bulb-outline" size={22} color="white" />
              </View>
              <View style={styles.smartMoveText}>
                <Text style={styles.smartMoveLabel}>Food tip</Text>
                <Text style={styles.smartMoveTitle} numberOfLines={2}>
                  {todayTip.title}
                </Text>
                <Text style={styles.smartMoveSnippet} numberOfLines={2}>
                  {todayTip.tip || todayTip.body || 'Small daily actions to support steadier blood sugar.'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
            </TouchableOpacity>

            {hasChallenge ? (
              <TouchableOpacity style={styles.smartChallengeRow} onPress={handleOpenChallenge} activeOpacity={0.9}>
                <View style={styles.smartChallengeIcon}>
                  <Ionicons
                    name={dailyChallenge.completed_today ? 'checkmark-circle' : 'trophy-outline'}
                    size={18}
                    color={dailyChallenge.completed_today ? Colors.success : Colors.accent}
                  />
                </View>
                <View style={styles.smartChallengeText}>
                  <Text style={styles.smartChallengeTitle} numberOfLines={1}>
                    {dailyChallenge.completed_today ? 'Challenge complete' : "Today's challenge"}
                  </Text>
                  <Text style={styles.smartChallengeMeta} numberOfLines={1}>
                    {challengeCompleted}/{challengeTotal} done • {Number(dailyChallenge?.streak_days || 0)} day streak
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Eat now */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Eat now</Text>
          <Text style={styles.sectionSubtitle}>Quick ideas for what you have right now.</Text>

          <TouchableOpacity style={styles.eatNowCard} activeOpacity={0.9} onPress={handleOpenEatNow}>
            <View style={styles.eatNowLeft}>
              <View style={styles.eatNowIcon}>
                <Ionicons name="fast-food-outline" size={22} color="white" />
              </View>
              <View style={styles.eatNowText}>
                <Text style={styles.eatNowTitle}>Eat now</Text>
                <Text style={styles.eatNowSub}>3 ideas in seconds - use what you have or surprise me.</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>

        </View>

        {/* Tools */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Tools</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Quick helpers for smarter choices.</Text>

          <View style={styles.miniRow}>
            <Pressable
              style={({ pressed }) => [styles.miniCard, styles.miniCardSwaps, pressed && styles.cardPressed]}
              android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              onPress={handleOpenSwaps}
            >
              <View style={styles.miniRowContent}>
                <View style={styles.miniLeft}>
                  <View style={styles.swapIconWrap}>
                    <Ionicons name="swap-horizontal-outline" size={20} color="white" />
                  </View>
                  <View style={styles.miniText}>
                    <Text style={styles.swapBadge}>Smart swaps</Text>
                    <Text style={styles.miniTitle}>Food swaps</Text>
                    <Text style={styles.miniSub} numberOfLines={1}>
                      Carbs, desserts, drinks
                    </Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </View>
            </Pressable>
          </View>
        </View>

        {/* Suggested Recipes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>3 picks for you</Text>
          </View>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.recipesScroll}
          >
            {isFetchingRecipes && suggestedRecipes.length === 0 ? (
              Array.from({ length: 3 }).map((_, idx) => (
                <View key={`skeleton-${idx}`} style={styles.recipeSkeletonCard}>
                  <View style={styles.recipeSkeletonImage} />
                  <View style={styles.recipeSkeletonInfo}>
                    <View style={styles.recipeSkeletonLineShort} />
                    <View style={styles.recipeSkeletonLine} />
                    <View style={styles.recipeSkeletonLine} />
                  </View>
                </View>
              ))
            ) : suggestedRecipes.map((recipe, index) => (
              <TouchableOpacity 
                key={recipe.id || `${recipe.name || 'recipe'}-${index}`}
                style={styles.recipeCard}
                onPress={() => handleViewRecipeDetail(recipe)}
              >
                {recipeImagesEnabled && recipe.image_url ? (
                  <Image source={{ uri: recipe.image_url }} style={styles.recipeImage} />
                ) : null}
                <View style={styles.recipeInfo}>
                  <View style={styles.recipeHeader}>
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        Diabetes-Safe
                      </Text>
                    </View>
                    <View style={styles.recipeSpacer} />
                    {(() => {
                      const timeValue = getRecipeTimeValue(recipe);
                      if (timeValue === '--') {
                        return <Text style={styles.recipeTime}>{timeValue}</Text>;
                      }
                      return (
                        <Text style={styles.recipeTime}>
                          {timeValue}
                          <Text style={styles.recipeTimeUnit}>mins</Text>
                        </Text>
                      );
                    })()}
                  </View>
                  <Text style={styles.recipeName} numberOfLines={2}>
                    {recipe.name || recipe.title}
                  </Text>
                  <View style={styles.recipeMetaRow}>
                    <Text style={[styles.recipeMetaValue, styles.recipeCal]}>{getRecipeCalories(recipe)}</Text>
                    <Text style={styles.recipeMetaDivider}>|</Text>
                    <Text style={[styles.recipeMetaValue, styles.recipePro]}>{getRecipeProtein(recipe)}</Text>
                    <Text style={styles.recipeMetaDivider}>|</Text>
                    <Text style={[styles.recipeMetaValue, styles.recipeFib]}>{getRecipeFiber(recipe)}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>

          <TouchableOpacity
            style={[styles.shuffleButton, isFetchingRecipes && styles.shuffleButtonDisabled]}
            onPress={handleShuffleSuggestions}
            disabled={isFetchingRecipes}
          >
            {isFetchingRecipes ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="shuffle" size={18} color="white" />
            )}
            <Text style={styles.shuffleText}>
              {isFetchingRecipes ? 'Refreshing...' : 'Shuffle recipes'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Recent Recipes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent recipes</Text>
            {recentRecipes.length ? (
              <TouchableOpacity style={styles.viewAllButton} onPress={handleViewRecentRecipes} activeOpacity={0.85}>
                <Text style={styles.viewAllText}>View all</Text>
                <Ionicons name="chevron-forward" size={16} color={Colors.primary} />
              </TouchableOpacity>
            ) : null}
          </View>
          <Text style={styles.sectionSubtitle}>Your latest generated meals.</Text>

          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.recipesScroll, { marginTop: 10 }]}>
            {isFetchingRecipes && recentRecipes.length === 0 ? (
              Array.from({ length: 2 }).map((_, idx) => (
                <View key={`recent-skeleton-${idx}`} style={styles.recentMiniCard}>
                  <View style={styles.recentMiniThumb} />
                  <View style={styles.recentMiniTextWrap}>
                    <View style={styles.recipeSkeletonLine} />
                    <View style={styles.recipeSkeletonLineShort} />
                  </View>
                </View>
              ))
            ) : recentRecipes.length ? (
              recentRecipes.slice(0, 5).map((recipe, index) => (
                <TouchableOpacity
                  key={recipe.id || `${recipe.name || 'recent'}-${index}`}
                  style={styles.recentMiniCard}
                  onPress={() => handleViewRecipeDetail(recipe)}
                  activeOpacity={0.9}
                >
                  {recipeImagesEnabled && getRecipeImageUrl(recipe) ? (
                    <Image source={{ uri: getRecipeImageUrl(recipe) }} style={styles.recentMiniThumb} />
                  ) : (
                    <View style={[styles.recentMiniThumb, { backgroundColor: Colors.border }]} />
                  )}
                  <View style={styles.recentMiniTextWrap}>
                    <Text style={styles.recentMiniTitle} numberOfLines={2}>
                      {recipe.name || recipe.title}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            ) : (
              <View style={styles.emptyInline}>
                <Text style={styles.emptyInlineText}>No recent recipes yet.</Text>
              </View>
            )}
          </ScrollView>
        </View>

      </ScrollView>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
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
  heroPrimaryCta: {
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
    overflow: 'hidden',
  },
  heroPrimaryCtaContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  heroCtaIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPrimaryIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCtaTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: Colors.text,
  },
  heroCtaSub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textLight,
  },
  heroCtaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: Colors.primary,
  },
  heroCtaButtonText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
  },
  heroSecondaryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
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
  heroSecondaryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  heroSecondaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: Colors.text,
  },
  heroSecondarySub: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '700',
    color: Colors.textLight,
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
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  greetingName: {
    fontSize: 16,
    fontWeight: '900',
    color: 'white',
  },
  subGreeting: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.78)',
    marginTop: 4,
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
  smartChallengeRow: {
    marginTop: 10,
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
  eatNowCard: {
    marginTop: 12,
    borderRadius: 18,
    padding: 16,
    backgroundColor: Colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  eatNowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  eatNowIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  eatNowText: { flex: 1 },
  eatNowTitle: { fontSize: 16, fontWeight: '900', color: 'white' },
  eatNowSub: { marginTop: 4, fontSize: 12, lineHeight: 17, color: 'rgba(255,255,255,0.92)', fontWeight: '600' },
  miniRow: { flexDirection: 'row', gap: 12, marginTop: 12 },
  miniCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    overflow: 'hidden',
  },
  miniRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    paddingRight: 10,
    gap: 10,
  },
  miniText: {
    flex: 1,
    marginRight: 10,
  },
  miniCardSwaps: {
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: 'rgba(237, 137, 54, 0.26)',
    shadowColor: Colors.accent,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 3,
  },
  miniCardChallenge: {
    backgroundColor: `${Colors.primary}14`,
  },
  swapIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  swapBadge: {
    alignSelf: 'flex-start',
    marginBottom: 3,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: 'rgba(237, 137, 54, 0.14)',
    color: '#9A4F12',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  miniTitle: { fontSize: 16, fontWeight: '900', color: Colors.text },
  miniSub: { marginTop: 3, fontSize: 13, color: Colors.textLight, fontWeight: '600' },
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

