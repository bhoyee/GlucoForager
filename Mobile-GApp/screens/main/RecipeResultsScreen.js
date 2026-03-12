// screens/main/RecipeResultsScreen.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';

export default function RecipeResultsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom + 4, 4);
  const {
    photoUri,
    images,
    recipes: recipesFromParams,
    selectedIngredients,
    detectedIngredients: detectedFromParams,
    warning,
    source,
  } = route.params || {};

  const [isLoading, setIsLoading] = useState(true);
  const [detectedIngredients, setDetectedIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);

  useEffect(() => {
    const ingredientSource = source === 'text' ? 'Input' : 'Detected';
    const useDetected = source === 'text'
      ? Array.isArray(detectedFromParams)
      : detectedFromParams?.length;
    const rawIngredients = useDetected
      ? detectedFromParams
      : selectedIngredients || [];

    const normalizedIngredients = rawIngredients.map((item, index) => {
      const name = typeof item === 'string' ? item : item?.name || `Ingredient ${index + 1}`;
      return {
        id: `${index}-${name}`,
        name,
        confidence: ingredientSource,
      };
    });

    setDetectedIngredients(normalizedIngredients);
    setRecipes(recipesFromParams || []);
    setIsLoading(false);
  }, [detectedFromParams, recipesFromParams, selectedIngredients, source]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[Colors.primary, '#4CAF50']}
          style={styles.loadingGradient}
        >
          <Ionicons name="sparkles" size={60} color="white" />
          <Text style={styles.loadingTitle}>Preparing Recipes</Text>
          <Text style={styles.loadingSubtitle}>
            Finding diabetes-safe recipes for your ingredients...
          </Text>
          <ActivityIndicator size="large" color="white" style={{ marginTop: 30 }} />
        </LinearGradient>
      </View>
    );
  }

  const heroImage = photoUri || images?.[0]?.uri;
  const hasRecipes = recipes.length > 0;
  const hasDetectedIngredients = detectedIngredients.length > 0;

  const formatTime = (recipe) => {
    const total = recipe?.total_time ?? recipe?.time ?? 0;
    if (typeof total === 'number' && total > 0) {
      return `${total} min`;
    }
    const prep = recipe?.prep_time ?? 0;
    const cook = recipe?.cook_time ?? 0;
    const sum = prep + cook;
    return sum > 0 ? `${sum} min` : 'N/A';
  };

  const getMatchText = (recipe) => {
    if (!selectedIngredients?.length) {
      const count = Array.isArray(recipe?.ingredients) ? recipe.ingredients.length : 0;
      return count ? `${count} ingredients` : 'Ingredients listed';
    }
    const selectedLower = selectedIngredients.map((item) => item.toLowerCase());
    const recipeNames = Array.isArray(recipe?.ingredients)
      ? recipe.ingredients
          .map((item) => (typeof item === 'string' ? item : item?.name))
          .filter(Boolean)
          .map((item) => item.toLowerCase())
      : [];
    const matches = recipeNames.filter((item) => selectedLower.includes(item));
    return `${matches.length}/${selectedIngredients.length} ingredients`;
  };

  const toIngredientImageUrl = (name) => {
    if (!name) return null;
    const cleaned = `${name}`.trim();
    if (!cleaned) return null;
    const encoded = encodeURIComponent(cleaned.replace(/\s+/g, '_'));
    return `https://www.themealdb.com/images/ingredients/${encoded}.png`;
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recipe Results</Text>
        <TouchableOpacity
          style={styles.scanAgainButton}
          onPress={() => navigation.navigate('Scan', { screen: 'ScanMain' })}
        >
          <Ionicons name="camera-outline" size={20} color={Colors.primary} />
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >
        {heroImage && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Your Scan</Text>
            <View style={styles.imageContainer}>
              <Image source={{ uri: heroImage }} style={styles.image} resizeMode="cover" />
              {hasDetectedIngredients && (
                <View style={styles.imageOverlay}>
                  <Text style={styles.imageOverlayText}>
                    {detectedIngredients.length} ingredients detected
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {warning && (
          <View style={styles.warningBanner}>
            <Ionicons name="alert-circle-outline" size={18} color={Colors.warning} />
            <Text style={styles.warningText}>{warning?.message || warning}</Text>
          </View>
        )}

        {hasDetectedIngredients ? (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Detected Ingredients</Text>
              <Text style={styles.ingredientCount}>{detectedIngredients.length} items</Text>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.ingredientsScroll}
            >
              {detectedIngredients.map((item) => (
                <View key={item.id} style={styles.ingredientCard}>
                  <View style={styles.ingredientIconContainer}>
                    {toIngredientImageUrl(item.name) ? (
                      <Image
                        source={{ uri: toIngredientImageUrl(item.name) }}
                        style={styles.ingredientImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <Ionicons name="nutrition-outline" size={26} color={Colors.primary} />
                    )}
                  </View>
                  <Text style={styles.ingredientName} numberOfLines={1}>{item.name}</Text>
                  <View style={styles.confidenceBadge}>
                    <Text style={styles.confidenceText}>{item.confidence}</Text>
                  </View>
                </View>
              ))}
            </ScrollView>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Diabetes-Safe Recipes</Text>
            <Text style={styles.recipeCount}>{recipes.length} recipes</Text>
          </View>
          <Text style={styles.sectionSubtitle}>
            {hasDetectedIngredients ? 'Low glycemic recipes based on your ingredients' : 'Diabetes-friendly ideas you can try today'}
          </Text>

          {hasRecipes ? recipes.map((recipe, index) => {
            const nutrition = recipe?.nutritional_info || {};
            const calories = nutrition.calories ?? recipe?.calories ?? 'N/A';
            const protein = nutrition.protein ?? recipe?.protein ?? 'N/A';
            const fiber = nutrition.fiber ?? recipe?.fiber ?? 'N/A';
            const title = recipe?.title || recipe?.name || `Recipe ${index + 1}`;
            const matchText = getMatchText(recipe);
            const imageKey = recipe.id || `${title}-${index}`;
            const macroText = (label, value, unit = '') => {
              const text = `${value ?? ''}`.trim();
              if (!text || text.toLowerCase() === 'n/a') return `${label} --`;
              if (unit && text.toLowerCase().endsWith(unit.toLowerCase())) return `${label} ${text}`;
              return `${label} ${text}${unit}`;
            };
            return (
              <TouchableOpacity
                key={imageKey}
                style={styles.recipeCard}
                onPress={() =>
                  navigation.navigate('RecipeDetail', {
                    recipe,
                    selectedIngredients,
                    source,
                  })
                }
              >
                <View style={styles.recipeInfo}>
                  <View style={styles.recipeHeader}>
                    <Text style={styles.recipeName} numberOfLines={2}>{title}</Text>
                  </View>

                  <View style={styles.recipeMeta}>
                    <Text style={styles.metaText}>{formatTime(recipe)}</Text>
                    <Text style={styles.recipeMetaDivider}>|</Text>
                    <Text style={[styles.recipeMetaValue, styles.recipeCal]}>{macroText('Cal', calories)}</Text>
                    <Text style={styles.recipeMetaDivider}>|</Text>
                    <Text style={[styles.recipeMetaValue, styles.recipePro]}>{macroText('Pro', protein, 'g')}</Text>
                    <Text style={styles.recipeMetaDivider}>|</Text>
                    <Text style={[styles.recipeMetaValue, styles.recipeFib]}>{macroText('Fib', fiber, 'g')}</Text>
                  </View>

                  <View style={styles.matchContainer}>
                    <LinearGradient
                      colors={[Colors.success, '#4CAF50']}
                      style={styles.matchBadge}
                    >
                      <Text style={styles.matchText}>{matchText}</Text>
                    </LinearGradient>
                  </View>
                </View>

                <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
              </TouchableOpacity>
            );
          }) : (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={32} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No recipes available</Text>
              <Text style={styles.emptyText}>Try different ingredients to generate recipes.</Text>
            </View>
          )}
        </View>

        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => navigation.navigate('ManualInput')}
          >
            <Ionicons name="add-circle-outline" size={22} color="white" />
            <Text style={styles.primaryButtonText}>Add Another Ingredient</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Scan', { screen: 'ScanMain' })}
          >
            <Ionicons name="camera-outline" size={22} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Scan Another Fridge</Text>
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
  warningBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${Colors.warning}15`,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
  },
  warningText: {
    marginLeft: 8,
    color: Colors.warning,
    fontSize: 13,
    lineHeight: 18,
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
  },
  loadingGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  loadingTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: 'white',
    marginTop: 20,
    marginBottom: 10,
  },
  loadingSubtitle: {
    fontSize: 16,
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    lineHeight: 22,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
  },
  scanAgainButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanAgainText: {
    marginLeft: 4,
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  scrollContent: {
    paddingTop: 8,
  },
  section: {
    marginBottom: 30,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  sectionSubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  ingredientCount: {
    fontSize: 14,
    color: Colors.textLight,
    fontWeight: '500',
  },
  recipeCount: {
    fontSize: 14,
    color: Colors.textLight,
    fontWeight: '500',
  },
  imageContainer: {
    marginHorizontal: 20,
    marginBottom: 10,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: 180,
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  imageOverlayText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  ingredientsScroll: {
    paddingLeft: 20,
  },
  ingredientCard: {
    width: 120,
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginRight: 12,
    alignItems: 'center',
  },
  ingredientIconContainer: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
  },
  ingredientImage: {
    width: '100%',
    height: '100%',
  },
  ingredientName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 6,
  },
  confidenceBadge: {
    backgroundColor: Colors.success + '15',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: 8,
  },
  confidenceText: {
    fontSize: 12,
    color: Colors.success,
    fontWeight: '600',
  },
  ingredientCategory: {
    fontSize: 12,
    color: Colors.textLight,
  },
  recipeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 16,
    marginHorizontal: 20,
    marginBottom: 12,
  },
  recipeInfo: {
    flex: 1,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  recipeName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    flex: 1,
    marginRight: 8,
    lineHeight: 22,
  },
  recipeMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    marginBottom: 12,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textLight,
    fontWeight: '600',
  },
  recipeMetaDivider: {
    marginHorizontal: 8,
    fontSize: 12,
    color: Colors.textMuted,
  },
  recipeMetaValue: {
    fontSize: 13,
    fontWeight: '800',
  },
  recipeCal: {
    color: Colors.accent,
  },
  recipePro: {
    color: Colors.secondary,
  },
  recipeFib: {
    color: Colors.primary,
  },
  matchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  matchBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 8,
  },
  matchText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  matchLabel: {
    fontSize: 12,
    color: Colors.textLight,
  },
  emptyState: {
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: 20,
    padding: 20,
    borderRadius: 16,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  emptyText: {
    marginTop: 6,
    fontSize: 14,
    color: Colors.textLight,
    textAlign: 'center',
  },
  actionButtons: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    marginBottom: 12,
  },
  primaryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 16,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
});
