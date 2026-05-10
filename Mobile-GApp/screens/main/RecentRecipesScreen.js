// screens/main/RecentRecipesScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
  Image,
} from 'react-native';
import { useNavigation, useRoute, useIsFocused } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Colors } from '../../constants/Colors';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import { getRecipeImageSettings } from '../../utils/recipeImageSettings';
import { getCachedRecipeImageUrl, isPlaceholderRecipeImageUrl, setCachedRecipeImageUrl } from '../../utils/recipeImageCache';

export default function RecentRecipesScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(tabBarHeight - 12, 8);
  const isHistoryMode = route.params?.mode === 'history';
  const initialTotal = Number(route.params?.totalRecipes || 0);
  const initialRecipes = Array.isArray(route.params?.initialRecipes)
    ? route.params.initialRecipes
    : [];

  const [recipes, setRecipes] = useState(isHistoryMode ? [] : initialRecipes);
  const [isLoading, setIsLoading] = useState(isHistoryMode || initialRecipes.length === 0);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [hasMore, setHasMore] = useState(isHistoryMode);
  const [totalRecipes, setTotalRecipes] = useState(initialTotal);
  const [recipeImagesEnabled, setRecipeImagesEnabled] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const settings = await getRecipeImageSettings();
      if (!cancelled) {
        setRecipeImagesEnabled(Boolean(settings?.enabled));
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const getRecipeTimeValue = (recipe) => {
    const prepRaw =
      recipe?.prep_time_minutes ??
      recipe?.prepTime ??
      recipe?.prep_time ??
      null;
    const cookRaw = recipe?.cook_time_minutes ?? recipe?.cookTime ?? recipe?.cook_time ?? null;
    const prep = typeof prepRaw === 'number' ? prepRaw : parseFloat(prepRaw);
    const cook = typeof cookRaw === 'number' ? cookRaw : parseFloat(cookRaw);
    if (Number.isFinite(prep) || Number.isFinite(cook)) {
      const total = (Number.isFinite(prep) ? prep : 0) + (Number.isFinite(cook) ? cook : 0);
      if (!total) return 'Time N/A';
      return `${total} mins`;
    }
    const totalRaw = recipe?.total_time ?? recipe?.totalTime ?? recipe?.time ?? null;
    const total = typeof totalRaw === 'number' ? totalRaw : parseFloat(totalRaw);
    if (Number.isFinite(total)) {
      return `${total} mins`;
    }
    return 'Time N/A';
  };

  const getNutritionObject = (recipe) => {
    return (
      recipe?.nutritional_info ||
      recipe?.nutrition ||
      recipe?.nutrition_per_serving ||
      recipe?.nutritionPerServing ||
      recipe?.nutrition_per_serving ||
      {}
    );
  };

  const getCaloriesValue = (recipe) => {
    const nutrition = getNutritionObject(recipe);
    const value = nutrition?.calories ?? recipe?.calories;
    return formatMacro('Cal', value);
  };

  const getProteinValue = (recipe) => {
    const nutrition = getNutritionObject(recipe);
    const value = nutrition?.protein ?? recipe?.protein;
    return formatMacro('Pro', value, 'g');
  };

  const getFiberValue = (recipe) => {
    const nutrition = getNutritionObject(recipe);
    const value = nutrition?.fiber ?? recipe?.fiber;
    return formatMacro('Fib', value, 'g');
  };

  const formatMacro = (label, value, unit = '') => {
    const emptyLabel = `${label} --`;
    if (value === undefined || value === null || value === '') return emptyLabel;
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${label} ${value}${unit ? unit : ''}`;
    }
    const match = `${value}`.match(/[-+]?\d*\.?\d+/);
    if (!match) return emptyLabel;
    const n = match[0];
    return `${label} ${n}${unit ? unit : ''}`;
  };

  const hydrateRecipeImages = useCallback(async (items) => {
    return Promise.all(
      items.map(async (recipe) => {
        if (!recipe || typeof recipe !== 'object') return recipe;
        const directUrl =
          (typeof recipe?.image_url === 'string' && recipe.image_url.trim())
            ? recipe.image_url.trim()
            : (typeof recipe?.image === 'string' && recipe.image.trim())
              ? recipe.image.trim()
              : '';
        const imageSource = String(recipe?.image_source || recipe?.imageSource || '').toLowerCase();
        if (directUrl && imageSource !== 'placeholder' && !isPlaceholderRecipeImageUrl(directUrl)) {
          await setCachedRecipeImageUrl(recipe, directUrl);
          return { ...recipe, image_url: recipe.image_url || directUrl, image: recipe.image || directUrl };
        }
        const cached = await getCachedRecipeImageUrl(recipe);
        if (!cached) return recipe;
        return { ...recipe, image_url: cached, image: cached, image_source: recipe.image_source || 'ai' };
      })
    );
  }, []);

  const loadRecipes = useCallback(async ({ reset = true, append = false, offsetOverride = 0 } = {}) => {
    try {
      if (append) {
        setIsLoadingMore(true);
      } else if (reset) {
        setIsLoading(true);
      }
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setRecipes([]);
        setHasMore(false);
        return;
      }
      const offset = append ? offsetOverride : 0;
      const endpoint = isHistoryMode
        ? `${API_URL}${API_ENDPOINTS.RECIPE_HISTORY}?limit=20&offset=${offset}`
        : `${API_URL}${API_ENDPOINTS.RECENT_RECIPES}`;
      const response = await apiFetch(
        endpoint,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        setRecipes([]);
        setHasMore(false);
        return;
      }
      if (!response.ok) {
        Alert.alert('Error', `Unable to load ${isHistoryMode ? 'recipe history' : 'recent recipes'} right now.`);
        return;
      }
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      const hydrated = await hydrateRecipeImages(items);

      setRecipes((current) => (append ? [...current, ...hydrated] : hydrated));
      if (isHistoryMode) {
        setTotalRecipes(Number(data.total || hydrated.length || 0));
        setNextOffset(Number(data.next_offset || 0));
        setHasMore(Boolean(data.has_more));
      } else {
        setHasMore(false);
        setNextOffset(0);
        setTotalRecipes(hydrated.length);
      }
    } catch (error) {
      Alert.alert('Error', `Unable to load ${isHistoryMode ? 'recipe history' : 'recent recipes'} right now.`);
    } finally {
      setIsLoading(false);
      setIsLoadingMore(false);
      setRefreshing(false);
    }
  }, [hydrateRecipeImages, isHistoryMode, signOut]);

  useEffect(() => {
    if (isFocused) {
      loadRecipes({ reset: true });
    }
  }, [isFocused, loadRecipes]);

  const onRefresh = () => {
    setRefreshing(true);
    loadRecipes({ reset: true });
  };

  const handleLoadMore = () => {
    if (!isHistoryMode || !hasMore || isLoadingMore) return;
    loadRecipes({ reset: false, append: true, offsetOverride: nextOffset });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>
          {isHistoryMode ? 'Loading recipe history...' : 'Loading recent recipes...'}
        </Text>
      </View>
    );
  }

  if (recipes.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isHistoryMode ? 'Recipe History' : 'Recent Recipes'}</Text>
          <View style={styles.headerRight} />
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="time-outline" size={96} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>
            {isHistoryMode ? 'No recipe history' : 'No recent recipes'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {isHistoryMode ? 'Every generated recipe will show here.' : 'Your most recent AI results will show here.'}
          </Text>
          <TouchableOpacity
            style={styles.button}
            onPress={() => navigation.navigate('Home')}
          >
            <Ionicons name="restaurant-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Find Recipes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>{isHistoryMode ? 'Recipe History' : 'Recent Recipes'}</Text>
          <Text style={styles.headerSubtitle}>
            {isHistoryMode ? `${recipes.length} of ${totalRecipes || recipes.length} recipes` : `${recipes.length} recipes`}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
          />
        }
      >
        {recipes.map((recipe, index) => {
          const title = recipe.name || recipe.title || `Recipe ${index + 1}`;
          const showThumb =
            recipeImagesEnabled &&
            Boolean(recipe.image_url);
          return (
            <TouchableOpacity
              key={recipe.history_key || recipe.id || `${title}-${index}`}
              style={styles.recipeCard}
              onPress={() => navigation.navigate('RecipeDetail', { recipe, source: 'ai' })}
              activeOpacity={0.7}
            >
              {recipeImagesEnabled ? (
                <View style={styles.thumb}>
                  {showThumb ? (
                    <Image source={{ uri: recipe.image_url }} style={styles.thumbImage} />
                  ) : (
                    <View style={styles.thumbPlaceholder}>
                      <Ionicons name="image-outline" size={20} color={Colors.textLight} />
                    </View>
                  )}
                </View>
              ) : null}
              <View style={styles.recipeInfo}>
                <Text style={styles.recipeName} numberOfLines={1}>{title}</Text>
                <Text style={styles.recipeDescription} numberOfLines={2}>
                  {recipe.description || 'Diabetes-friendly recipe.'}
                </Text>
                <View style={styles.recipeMetaRow}>
                  <Text style={styles.metaText}>{getRecipeTimeValue(recipe)}</Text>
                  <Text style={styles.recipeMetaDivider}>|</Text>
                  <Text style={[styles.recipeMetaValue, styles.recipeCal]}>{getCaloriesValue(recipe)}</Text>
                  <Text style={styles.recipeMetaDivider}>|</Text>
                  <Text style={[styles.recipeMetaValue, styles.recipePro]}>{getProteinValue(recipe)}</Text>
                  <Text style={styles.recipeMetaDivider}>|</Text>
                  <Text style={[styles.recipeMetaValue, styles.recipeFib]}>{getFiberValue(recipe)}</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={20} color={Colors.textLight} />
            </TouchableOpacity>
          );
        })}
        {isHistoryMode && hasMore ? (
          <TouchableOpacity
            style={[styles.loadMoreButton, isLoadingMore && styles.loadMoreButtonDisabled]}
            onPress={handleLoadMore}
            disabled={isLoadingMore}
            activeOpacity={0.85}
          >
            {isLoadingMore ? (
              <ActivityIndicator size="small" color="white" />
            ) : (
              <Ionicons name="add-circle-outline" size={18} color="white" />
            )}
            <Text style={styles.loadMoreText}>{isLoadingMore ? 'Loading...' : 'Load more recipes'}</Text>
          </TouchableOpacity>
        ) : null}
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
    backgroundColor: Colors.background,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  headerText: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 13,
    color: Colors.textLight,
    marginTop: 4,
  },
  headerRight: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Colors.textLight,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.text,
    marginTop: 16,
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 20,
    paddingHorizontal: 24,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
  },
  buttonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  thumb: {
    width: 54,
    height: 54,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#F3F4F6',
    marginRight: 12,
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  thumbPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recipeInfo: {
    flex: 1,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
  },
  recipeDescription: {
    fontSize: 13,
    color: Colors.textLight,
    marginBottom: 8,
  },
  recipeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaText: {
    fontSize: 12,
    color: Colors.textLight,
    flexShrink: 0,
    minWidth: 58,
  },
  recipeMetaValue: {
    fontSize: 12,
    fontWeight: '700',
  },
  recipeMetaDivider: {
    marginHorizontal: 8,
    fontSize: 12,
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
  loadMoreButton: {
    marginTop: 4,
    marginBottom: 18,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 18,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadMoreButtonDisabled: {
    opacity: 0.72,
  },
  loadMoreText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
  },
});
