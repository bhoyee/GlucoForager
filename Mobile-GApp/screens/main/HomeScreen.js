// screens/main/HomeScreen.js - UPDATED PRODUCTION VERSION
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  StatusBar,
  Alert,
  ActivityIndicator,
  Image,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';

export default function HomeScreen() {
  const navigation = useNavigation();
  const { signOut } = useAuth();
  
  const [userIsPremium, setUserIsPremium] = useState(false);
  const [todayScans, setTodayScans] = useState(0);
  const [remainingScans, setRemainingScans] = useState(3);
  const [dailyLimit, setDailyLimit] = useState(3);
  const [isLoading, setIsLoading] = useState(true);
  const [suggestedRecipes, setSuggestedRecipes] = useState([]);
  const [isFetchingRecipes, setIsFetchingRecipes] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(true);
  const [userStats, setUserStats] = useState({
    recipesGenerated: 0,
    scansToday: 0,
    favoritesSaved: 0,
  });

  const getDeviceId = async () => {
    const existing = await AsyncStorage.getItem('deviceId');
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem('deviceId', generated);
    return generated;
  };

  // Load user data
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const loadUserData = async () => {
        try {
          setIsLoading(true);

          // Load user data from AsyncStorage
          await loadScanStatus();
          await loadUserStats();
          await loadRecipes();
        } catch (error) {
          console.error('Error loading user data:', error);
          // Set defaults on error
          setUserIsPremium(false);
          setTodayScans(0);
          setRemainingScans(3);
          setDailyLimit(3);
          setUserStats({ recipesGenerated: 0, scansToday: 0, favoritesSaved: 0 });
        } finally {
          if (isActive) {
            setIsLoading(false);
          }
        }
      };

      loadUserData();
      return () => {
        isActive = false;
      };
    }, [])
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
      { onUnauthorized: signOut }
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
      { onUnauthorized: signOut }
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
  };

  const loadRecipes = async () => {
    try {
      setIsFetchingRecipes(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setSuggestedRecipes([]);
        return;
      }

      await fetchSuggestions(token);
    } catch (error) {
      console.error('Error loading recipes:', error);
      setSuggestedRecipes([]);
    } finally {
      setIsFetchingRecipes(false);
    }
  };

  const fetchSuggestions = async (token) => {
    const mealType = getMealType();
    const response = await apiFetch(
      `${API_URL}${API_ENDPOINTS.RECIPE_SUGGESTIONS}?limit=3&meal_type=${mealType}`,
      { headers: { Authorization: `Bearer ${token}` } },
      { onUnauthorized: signOut }
    );
    if (response.status === 401) {
      return;
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    setSuggestedRecipes(items);
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
      console.error('Error checking scan limit:', error);
      Alert.alert('Error', 'Unable to check scan limit. Please try again.');
    }
  };

  const handleScanPress = () => {
    checkScanLimit('scan');
  };

  const handleManualInputPress = () => {
    checkScanLimit('manual');
  };

  const handleViewRecipeDetail = (recipe) => {
    navigation.navigate('RecipeDetail', { recipe });
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

  // Development reset button (remove in production)
  const handleResetScans = async () => {
    if (!__DEV__) return; // Only in development
    
    Alert.alert(
      'Reset Scans (Dev Only)',
      'This will reset your scan counter to 0.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              await loadScanStatus();
              Alert.alert('Success', 'Scan status refreshed');
            } catch (error) {
              Alert.alert('Error', 'Failed to reset scans');
            }
          }
        }
      ]
    );
  };

  if (isLoading) {
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
      
      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Header */}
        <View style={styles.header}>
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
          
          {!userIsPremium && remainingScans === 0 && (
            <TouchableOpacity 
              style={styles.upgradePrompt}
              onPress={handleUpgradePress}
            >
              <Text style={styles.upgradeText}>Upgrade to Premium for unlimited scans</Text>
              <Ionicons name="arrow-forward" size={16} color={Colors.primary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Main Actions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Find Recipes</Text>
          
          {/* Camera Scan Card */}
          <TouchableOpacity 
            style={styles.actionCard}
            onPress={handleScanPress}
          >
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
            style={styles.actionCard}
            onPress={handleManualInputPress}
          >
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
                {recipe.image_url ? (
                  <Image source={{ uri: recipe.image_url }} style={styles.recipeImage} />
                ) : (
                  <View style={styles.recipeImagePlaceholder}>
                    <Ionicons name="restaurant-outline" size={40} color={Colors.textLight} />
                  </View>
                )}
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
                          <Text style={styles.recipeTimeUnit}>min</Text>
                        </Text>
                      );
                    })()}
                  </View>
                  <Text style={styles.recipeName} numberOfLines={2}>
                    {recipe.name || recipe.title}
                  </Text>
                  <Text style={styles.recipeMatch}>
                    {getRecipeCalories(recipe)} | {getRecipeProtein(recipe)} | {getRecipeFiber(recipe)}
                  </Text>
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

        {/* Upgrade Banner */}
        {!userIsPremium && (
          <View style={styles.section}>
            <TouchableOpacity 
              style={styles.upgradeBanner}
              onPress={handleUpgradePress}
            >
              <View style={styles.upgradeContent}>
                <View>
                  <Text style={styles.upgradeBannerTitle}>Unlock Premium Features</Text>
                  <Text style={styles.upgradeBannerSubtitle}>
                    Unlimited scans, advanced filters, and no ads
                  </Text>
                  <View style={styles.priceContainer}>
                    <Text style={styles.price}>$2.99</Text>
                    <Text style={styles.pricePeriod}>/month</Text>
                  </View>
                </View>
                <Ionicons name="sparkles" size={32} color="white" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* Quick Stats */}
        <View style={styles.statsSection}>
          <Text style={styles.sectionTitle}>Your Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{userStats.recipesGenerated}</Text>
              <Text style={styles.statLabel}>Recipes generated</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{userStats.scansToday}</Text>
              <Text style={styles.statLabel}>Scans today</Text>
            </View>
            <View style={styles.statCard}>
              <Text style={styles.statValue}>{userStats.favoritesSaved}</Text>
              <Text style={styles.statLabel}>Favorites saved</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Development Only: Reset Button */}
      {__DEV__ && (
        <TouchableOpacity 
          style={styles.devResetButton}
          onPress={handleResetScans}
          onLongPress={async () => {
            await loadScanStatus();
            Alert.alert('Dev Mode', 'Refreshed server scan status');
          }}
        >
          <Ionicons name="bug-outline" size={20} color="white" />
        </TouchableOpacity>
      )}
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
    paddingBottom: 30,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
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
  recipeMatch: {
    fontSize: 14,
    color: Colors.textLight,
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
  upgradeBanner: {
    backgroundColor: Colors.primary,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  upgradeContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  upgradeBannerTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: 'white',
    marginBottom: 4,
  },
  upgradeBannerSubtitle: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.9)',
    marginBottom: 12,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  price: {
    fontSize: 24,
    fontWeight: 'bold',
    color: 'white',
  },
  pricePeriod: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 4,
  },
  statsSection: {
    paddingHorizontal: 20,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCard: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: Colors.primary,
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textLight,
    textAlign: 'center',
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
