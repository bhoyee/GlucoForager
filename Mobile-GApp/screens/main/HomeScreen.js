// screens/main/HomeScreen.js - UPDATED PRODUCTION VERSION
import React, { useState, useCallback, useMemo } from 'react';
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
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { getRecipeImageSettings } from '../../utils/recipeImageSettings';
import { getTodayTip } from '../../utils/todayTips';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 4, 6);
  
  const [userIsPremium, setUserIsPremium] = useState(false);
  const [todayScans, setTodayScans] = useState(0);
  const [remainingScans, setRemainingScans] = useState(3);
  const [dailyLimit, setDailyLimit] = useState(3);
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
        { timeoutMs: 5000 }
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
        { timeoutMs: 5000 }
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
        { timeoutMs: 5000 }
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
        if (typeof data.todayScans === 'number') {
          setTodayScans(data.todayScans);
        }
        if (typeof data.remainingScans === 'number') {
          setRemainingScans(data.remainingScans);
        }
        if (typeof data.dailyLimit === 'number') {
          setDailyLimit(data.dailyLimit);
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
          setRecentRecipes(recentItems);
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
      setRemainingScans(3);
      setDailyLimit(3);
      return;
    }

    const deviceId = await getDeviceId();
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.SCANS_TODAY}`,
      { headers: { Authorization: `Bearer ${token}`, 'X-Device-Id': deviceId } },
      { onUnauthorized: signOut, timeoutMs: 5000 }
    );
    if (response.status === 401) {
      setUserIsPremium(false);
      setTodayScans(0);
      setRemainingScans(3);
      setDailyLimit(3);
      return;
    }
    if (!response.ok) {
      throw new Error('Unable to fetch scan status.');
    }
    const data = await response.json();
    const isPremium =
      data.is_premium === true ||
      data.subscription_tier === 'premium' ||
      data.searches_left === 'unlimited';
    setUserIsPremium(isPremium);
    setTodayScans(data.total || 0);
    setRemainingScans(
      typeof data.searches_left === 'number' ? data.searches_left : 0
    );
    setDailyLimit(typeof data.daily_limit === 'number' ? data.daily_limit : 3);

    await AsyncStorage.setItem(
      'home_scan_status',
      JSON.stringify({
        isPremium,
        todayScans: data.total || 0,
        remainingScans:
          typeof data.searches_left === 'number' ? data.searches_left : 0,
        dailyLimit: typeof data.daily_limit === 'number' ? data.daily_limit : 3,
      })
    );
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
      { onUnauthorized: signOut, timeoutMs: 5000 }
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
      { onUnauthorized: signOut, timeoutMs: 5000 }
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
      { onUnauthorized: signOut, timeoutMs: 5000 }
    );
    if (response.status === 401) {
      return;
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    setRecentRecipes(items);
    await AsyncStorage.setItem('home_recent_recipes', JSON.stringify(items));
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
      const isPremium =
        data.is_premium === true ||
        data.subscription_tier === 'premium' ||
        data.searches_left === 'unlimited';
      const numericLeft = Number(data.searches_left);
      const allowed = isPremium || (Number.isFinite(numericLeft) && numericLeft > 0);

      if (allowed) {
        if (source === 'manual') {
          navigation.navigate('ManualInput');
        } else {
          // Navigate to Scan tab
          navigation.navigate('Scan', { screen: 'ScanMain' });
        }
      } else {
        Alert.alert(
          'Daily Limit Reached',
          'You have used all 3 free scans today. Upgrade to Premium for unlimited scans.',
          [
            { text: 'OK', style: 'cancel' },
            { 
              text: 'Upgrade', 
              onPress: () => navigation.navigate('Profile')
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
    navigation.navigate('Profile', { openPremium: true });
  };

  if (isLoading && isInitialLoad) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={Colors.background} />
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <View>
          <Text style={styles.greeting}>Welcome back</Text>
          <Text style={styles.subGreeting}>What's cooking today?</Text>
        </View>
        <TouchableOpacity 
          style={styles.notificationButton}
          onPress={() => navigation.navigate('Profile')}
        >
          <Ionicons name="notifications-outline" size={24} color={Colors.text} />
        </TouchableOpacity>
      </View>
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >
        {isRefreshing && (
          <View style={styles.refreshRow}>
            <ActivityIndicator size="small" color={Colors.primary} />
            <Text style={styles.refreshText}>Refreshing dataâ€¦</Text>
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

        {/* Search Counter Card */}
        <View style={styles.counterCard}>
          <View style={styles.counterHeader}>
            <View>
              <Text style={styles.counterTitle}>Daily Scans</Text>
              <Text style={styles.counterSubtitle}>
                {userIsPremium ? 'Unlimited scans' : `${remainingScans} scans remaining today`}
              </Text>
            </View>
            <View style={styles.counterIcon}>
              <Ionicons name="camera-outline" size={24} color={Colors.primary} />
            </View>
          </View>
          
          {!userIsPremium && (
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${dailyLimit ? (todayScans / dailyLimit) * 100 : 0}%` },
                ]}
              />
            </View>
          )}
          
        {!userIsPremium && Number(remainingScans) <= 0 && (
          <TouchableOpacity 
            style={styles.upgradePrompt}
            onPress={handleUpgradePaywall}
            >
              <Text style={styles.upgradeText}>Upgrade to Premium</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Daily */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Daily</Text>
          <Text style={styles.sectionSubtitle}>Small daily actions to support steadier blood sugar.</Text>

          <Pressable
            style={({ pressed }) => [styles.tipCard, pressed && styles.cardPressed]}
            android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
            onPress={handleOpenTip}
          >
            <View style={styles.tipIcon}>
              <Ionicons name="bulb-outline" size={20} color={Colors.primary} />
            </View>
            <View style={styles.tipText}>
              <Text style={styles.tipLabel}>Today's tip</Text>
              <Text style={styles.tipTitle} numberOfLines={2}>
                {todayTip.title}
              </Text>
              <Text style={styles.tipSnippet} numberOfLines={1}>
                {todayTip.tip || todayTip.body || 'Small daily actions to support steadier blood sugar.'}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
          </Pressable>
        </View>

        {dailyChallenge?.tasks?.length ? (
          <View style={styles.section}>
            <Pressable
              style={({ pressed }) => [styles.challengeCard, pressed && styles.cardPressed]}
              android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              onPress={handleOpenChallenge}
            >
              <View style={styles.challengeIcon}>
                <Ionicons name="trophy-outline" size={20} color={Colors.primary} />
              </View>
              <View style={styles.challengeText}>
                <Text style={styles.tipLabel}>Today's diabetes challenge</Text>
                <Text style={styles.tipTitle} numberOfLines={2}>
                  {dailyChallenge.completed_today
                    ? 'Challenge complete'
                    : `Progress ${Number(dailyChallenge?.progress?.completed || 0)} / ${Number(dailyChallenge?.progress?.total || 0)}`}
                </Text>
                <Text style={styles.tipSnippet} numberOfLines={1}>
                  Streak {Number(dailyChallenge?.streak_days || 0)} days
                </Text>
                <View style={styles.challengeRows}>
                  {dailyChallenge.tasks.slice(0, 3).map((t) => (
                    <View key={t.id} style={styles.challengeRow}>
                      <Ionicons
                        name={t.completed ? 'checkmark-circle' : 'ellipse-outline'}
                        size={14}
                        color={t.completed ? Colors.success : Colors.textLight}
                      />
                      <Text style={styles.challengeRowText} numberOfLines={1}>
                        {t.text}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
            </Pressable>
          </View>
        ) : null}

        {/* Main Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Find Recipes</Text>

          {/* Eat now */}
          <TouchableOpacity style={styles.eatNowCard} activeOpacity={0.9} onPress={handleOpenEatNow}>
            <View style={styles.eatNowLeft}>
              <View style={styles.eatNowIcon}>
                <Ionicons name="sparkles-outline" size={22} color="white" />
              </View>
              <View style={styles.eatNowText}>
                <Text style={styles.eatNowTitle}>Eat now</Text>
                <Text style={styles.eatNowSub}>3 ideas in seconds - use what you have or surprise me.</Text>
              </View>
            </View>
            <Ionicons name="chevron-forward" size={22} color="rgba(255,255,255,0.9)" />
          </TouchableOpacity>
          
          {/* Camera Scan Card */}
          <TouchableOpacity 
            style={[styles.actionCard, styles.actionCardPrimary]}
            onPress={handleScanPress}
          >
            <View style={[styles.cardAccent, { backgroundColor: Colors.primary }]} pointerEvents="none" />
            <View style={styles.actionContent}>
              <View style={[styles.actionIcon, { backgroundColor: `${Colors.primary}15` }]}>
                <Ionicons name="camera-outline" size={28} color={Colors.primary} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Scan Ingredients</Text>
                <Text style={styles.actionDescription}>
                  {userIsPremium 
                    ? 'Take a photo of your fridge' 
                    : `${remainingScans} scans left today`
                  }
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </View>
          </TouchableOpacity>

          {/* Manual Input Card */}
          <TouchableOpacity 
            style={[styles.actionCard, styles.actionCardSecondary]}
            onPress={handleManualInputPress}
          >
            <View style={[styles.cardAccent, { backgroundColor: Colors.secondary }]} pointerEvents="none" />
            <View style={styles.actionContent}>
              <View style={[styles.actionIcon, { backgroundColor: `${Colors.secondary}15` }]}>
                <Ionicons name="create-outline" size={28} color={Colors.secondary} />
              </View>
              <View style={styles.actionText}>
                <Text style={styles.actionTitle}>Type Ingredients</Text>
                <Text style={styles.actionDescription}>
                  {userIsPremium
                    ? 'Enter what you have manually'
                    : `${remainingScans} searches left today`}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </View>
          </TouchableOpacity>

          {recentRecipes.length > 0 && (
            <TouchableOpacity
              style={styles.recentRow}
              onPress={handleViewRecentRecipes}
            >
              <View style={[styles.cardAccent, { backgroundColor: Colors.primary }]} pointerEvents="none" />
              <View style={styles.recentRowContent}>
                <Ionicons name="time-outline" size={18} color={Colors.primary} />
                <Text style={styles.recentRowText}>Last Recipes</Text>
              </View>
              <View style={styles.recentRowRight}>
                <Text style={styles.recentRowCount}>{recentRecipes.length}</Text>
                <Ionicons name="chevron-forward" size={18} color={Colors.textLight} />
              </View>
            </TouchableOpacity>
          )}
        </View>

        {/* Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tools</Text>
          <Text style={styles.sectionSubtitle}>Quick helpers for smarter choices.</Text>

          <View style={styles.miniRow}>
            <Pressable
              style={({ pressed }) => [styles.miniCard, styles.miniCardSwaps, pressed && styles.cardPressed]}
              android_ripple={{ color: 'rgba(0,0,0,0.06)' }}
              onPress={handleOpenSwaps}
            >
              <View style={[styles.miniIcon, { backgroundColor: `${Colors.secondary}18` }]}>
                <Ionicons name="swap-horizontal-outline" size={18} color={Colors.secondary} />
              </View>
              <Text style={styles.miniTitle}>Food swaps</Text>
              <Text style={styles.miniSub} numberOfLines={1}>Carbs, desserts, drinks</Text>
            </Pressable>
          </View>
        </View>

        {/* Suggest Me 3 Recipes */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>
              Suggest me 3 recipes
            </Text>
          </View>
          
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            style={styles.recipesScroll}
          >
            {suggestedRecipes.map((recipe, index) => (
              <TouchableOpacity 
                key={recipe.id || `${recipe.name || 'recipe'}-${index}`}
                style={styles.recipeCard}
                onPress={() => handleViewRecipeDetail(recipe)}
              >
                {recipeImagesEnabled && recipe.image_url && recipe.image_source !== 'placeholder' ? (
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
            style={styles.shuffleButton}
            onPress={handleShuffleSuggestions}
            disabled={isFetchingRecipes}
          >
            <Ionicons name="shuffle" size={18} color={Colors.primary} />
            <Text style={styles.shuffleText}>
              {isFetchingRecipes ? 'Refreshing...' : 'Shuffle recipes'}
            </Text>
          </TouchableOpacity>
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
    paddingTop: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  subGreeting: {
    fontSize: 16,
    color: Colors.textLight,
    marginTop: 4,
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
  },
  miniIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  miniCardSwaps: {
    backgroundColor: `${Colors.secondary}14`,
  },
  miniCardChallenge: {
    backgroundColor: `${Colors.primary}14`,
  },
  miniTitle: { fontSize: 14, fontWeight: '900', color: Colors.text },
  miniSub: { marginTop: 2, fontSize: 12, color: Colors.textLight, fontWeight: '700' },
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
  shuffleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    backgroundColor: `${Colors.primary}15`,
  },
  shuffleText: {
    marginLeft: 8,
    color: Colors.primary,
    fontWeight: '600',
    fontSize: 14,
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

