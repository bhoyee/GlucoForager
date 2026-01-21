// screens/main/FavoritesScreen.js
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import RecipePlaceholder from '../../assets/images/recipe-placeholder.jpeg';

export default function FavoritesScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(tabBarHeight - 12, 8);

  const [favorites, setFavorites] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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
      return total ? `${total} min` : 'Time N/A';
    }
    const totalRaw = recipe?.total_time ?? recipe?.totalTime ?? recipe?.time ?? null;
    const total = typeof totalRaw === 'number' ? totalRaw : parseFloat(totalRaw);
    if (Number.isFinite(total)) {
      return `${total} min`;
    }
    return 'Time N/A';
  };

  const getCaloriesValue = (nutrition) => {
    if (!nutrition) return 'N/A';
    const raw = nutrition.calories ?? nutrition.calorie ?? null;
    if (raw === null || raw === undefined || raw === '') return 'N/A';
    const numeric = typeof raw === 'number' ? raw : parseFloat(raw);
    return Number.isFinite(numeric) ? `${numeric}` : `${raw}`;
  };

  const normalizeFavorite = (item, index) => {
    const recipe = item.recipe || {};
    const nutrition = recipe.nutrition || recipe.nutrition_per_serving || {};
    return {
      id: item.id || `${index}`,
      favoriteId: item.id || `${index}`,
      recipeId: recipe.id || null,
      recipe,
      name: recipe.title || recipe.name || item.title || 'Recipe',
      description: recipe.description || 'Diabetes-friendly recipe.',
      image: recipe.image_url || recipe.image || '',
      imageSource: recipe.image_source || 'unknown',
      time: getRecipeTimeValue(recipe),
      calories: getCaloriesValue(nutrition),
    };
  };

  const loadFavorites = useCallback(async () => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setFavorites([]);
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.FAVORITES}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        setFavorites([]);
        return;
      }
      const data = await response.json();
      const items = Array.isArray(data.items) ? data.items : [];
      setFavorites(items.map(normalizeFavorite));
    } catch (error) {
      Alert.alert('Error', 'Unable to load favorites right now.');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [signOut]);

  useEffect(() => {
    if (isFocused) {
      setIsLoading(true);
      loadFavorites();
    }
  }, [isFocused, loadFavorites]);

  const onRefresh = () => {
    setRefreshing(true);
    loadFavorites();
  };

  const navigateToRecipe = (recipe) => {
    const source = recipe.recipeId || recipe.recipe?.id ? 'admin' : 'ai';
    navigation.navigate('RecipeDetail', { recipe: recipe.recipe || recipe, source });
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Loading favorites...</Text>
      </View>
    );
  }

  // Show empty state if no favorites
  if (favorites.length === 0) {
    return (
      <View style={styles.container}>
        <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
          <Text style={styles.headerTitle}>My Favorites</Text>
        </View>
        
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={100} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No Favorites Yet</Text>
          <Text style={styles.emptySubtitle}>
            Save recipes you love to see them here
          </Text>
          
          <TouchableOpacity 
            style={styles.button}
            onPress={() => navigation.navigate('Home')}
          >
            <Ionicons name="restaurant-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Browse Recipes</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show favorites list
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.headerTitle}>My Favorites</Text>
          <Text style={styles.headerSubtitle}>{favorites.length} saved recipes</Text>
        </View>
        
      </View>

      {/* Favorites List */}
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
        {favorites.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.favoriteCard}
            onPress={() => navigateToRecipe(item)}
            activeOpacity={0.7}
          >
            {/* Recipe Image */}
            <View style={styles.imageContainer}>
              {item.image && item.imageSource !== 'placeholder' ? (
                <Image source={{ uri: item.image }} style={styles.recipeImage} />
              ) : (
                <Image source={RecipePlaceholder} style={styles.recipeImage} />
              )}
              <View style={styles.imageOverlay}>
                <View style={styles.favoriteBadge}>
                  <Ionicons name="heart" size={12} color="white" />
                  <Text style={styles.favoriteBadgeText}>Saved</Text>
                </View>
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => removeFromFavorites(item.favoriteId)}
              >
                <Ionicons name="trash-outline" size={16} color="white" />
              </TouchableOpacity>
            </View>
          </View>

            {/* Recipe Info */}
            <View style={styles.recipeInfo}>
              <View style={styles.recipeHeader}>
                <Text style={styles.recipeName} numberOfLines={1}>{item.name}</Text>
              </View>
              
              <Text style={styles.recipeDescription} numberOfLines={2}>
                {item.description}
              </Text>
              
              <View style={styles.recipeMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.textLight} />
                  <Text style={styles.metaText}>{item.time}</Text>
                </View>
                
                <View style={styles.metaItem}>
                  <Ionicons name="flame-outline" size={14} color={Colors.textLight} />
                  <Text style={styles.metaText}>{item.calories} cal</Text>
                </View>
              </View>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  function removeFromFavorites(favoriteId) {
    Alert.alert(
      'Remove Favorite',
      'Are you sure you want to remove this recipe from favorites?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              const token = await AsyncStorage.getItem('userToken');
              if (!token) return;
              const response = await apiFetch(
                `${API_URL}${API_ENDPOINTS.FAVORITES}/${favoriteId}`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
                { onUnauthorized: signOut }
              );
              if (!response.ok) {
                Alert.alert('Error', 'Unable to remove favorite right now.');
                return;
              }
              setFavorites((prev) => prev.filter((item) => item.favoriteId !== favoriteId));
            } catch (error) {
              Alert.alert('Error', 'Unable to remove favorite right now.');
            }
          },
        },
      ]
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
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
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 4,
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
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 40,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
    minWidth: 200,
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  favoriteCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    height: 180,
    position: 'relative',
  },
  recipeImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  favoriteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  favoriteBadgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 6,
  },
  removeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: {
    padding: 16,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
  },
  recipeDescription: {
    fontSize: 14,
    color: Colors.textLight,
    lineHeight: 20,
    marginBottom: 12,
  },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textLight,
    marginLeft: 4,
  },
});
