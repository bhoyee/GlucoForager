import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Share,
  Alert,
  StyleSheet,
  Dimensions,
  Modal,
  Animated,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons, FontAwesome, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import RecipePlaceholder from '../../assets/images/recipe-placeholder.jpeg';

const { width } = Dimensions.get('window');

const mockRecipe = {
  id: '1',
  title: 'Mediterranean Quinoa Bowl',
  category: 'Diabetes-Friendly',
  prepTime: 15,
  cookTime: 20,
  totalTime: 35,
  servings: 2,
  difficulty: 'Easy',
  image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=800',
  isBookmarked: true,
  
  description: 'A balanced, diabetes-friendly bowl packed with protein, fiber, and healthy fats. Perfect for blood sugar management.',
  
  nutrition: {
    calories: 420,
    carbs: '45g',
    protein: '22g',
    fat: '18g',
    fiber: '12g',
    sugar: '8g',
  },
  
  ingredients: [
    { id: '1', name: 'Quinoa', amount: '1 cup', owned: true },
    { id: '2', name: 'Chicken breast', amount: '200g', owned: true },
    { id: '3', name: 'Cherry tomatoes', amount: '1 cup', owned: true },
    { id: '4', name: 'Cucumber', amount: '1 medium', owned: true },
    { id: '5', name: 'Red onion', amount: '½ cup', owned: false },
    { id: '6', name: 'Kalamata olives', amount: '¼ cup', owned: false },
    { id: '7', name: 'Feta cheese', amount: '50g', owned: true },
    { id: '8', name: 'Lemon juice', amount: '2 tbsp', owned: true },
    { id: '9', name: 'Olive oil', amount: '1 tbsp', owned: true },
    { id: '10', name: 'Fresh dill', amount: '2 tbsp', owned: false },
  ],
  
  instructions: [
    'Cook quinoa according to package instructions.',
    'Grill chicken breast until fully cooked, then slice.',
    'Dice cucumbers, halve cherry tomatoes, and thinly slice red onion.',
    'Whisk together lemon juice, olive oil, and chopped dill for dressing.',
    'Combine all ingredients in a large bowl and toss with dressing.',
    'Divide into bowls and top with crumbled feta cheese.',
    'Serve immediately or refrigerate for up to 3 days.',
  ],
  
  tips: [
    'Quinoa has a low glycemic index, making it ideal for diabetes management.',
    'Lean protein helps stabilize blood sugar levels.',
    'High fiber content slows carbohydrate absorption.',
    'Healthy fats from olive oil improve insulin sensitivity.',
  ],
};

const RecipeDetailsScreen = () => {
  const navigation = useNavigation();
  const route = useRoute();
  const insets = useSafeAreaInsets();
  const headerTop = Math.max(insets.top, 16);
  const contentBottomPadding = 0;
  const recipeSourceFromRoute = route.params?.source || null;
  const selectedFromRouteRaw = route.params?.selectedIngredients || [];
  const selectedFromRoute = Array.isArray(selectedFromRouteRaw)
    ? selectedFromRouteRaw
        .map((item) => (typeof item === 'string' ? item : item?.name))
        .filter((item) => Boolean(item))
    : [];
  const selectedIngredientKeys = selectedFromRoute.map((item) =>
    item.toLowerCase().trim()
  );
  const { signOut } = useAuth();
  const [recipe, setRecipe] = useState(mockRecipe);
  const [showIngredientsModal, setShowIngredientsModal] = useState(false);
  const [showSafetyModal, setShowSafetyModal] = useState(false);
  const [servings, setServings] = useState(recipe.servings);
  const [expandedTip, setExpandedTip] = useState(null);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  useEffect(() => {
    const init = async () => {
      const incoming = route.params?.recipe;
      if (incoming) {
        const normalized = normalizeRecipe(incoming);
        setRecipe(normalized);
        setServings(normalized.servings);
        if ((!normalized.ingredients || normalized.ingredients.length === 0) && incoming.id) {
          await fetchRecipeDetail(incoming.id);
        }
      }
    };
    init();
  }, [route.params]);


  const fetchRecipeDetail = async (recipeId) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.RECIPE_DETAIL}/${recipeId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut }
      );
      if (response.status === 401) {
        return;
      }
      const data = await response.json();
      if (response.ok && data?.id) {
        const normalized = normalizeRecipe(data);
        setRecipe(normalized);
        setServings(normalized.servings);
      }
    } catch (error) {
      // Keep fallback mock on error
    }
  };

  const normalizeIngredientKey = (value) => `${value || ''}`.toLowerCase().trim();

  const hasSelectedIngredient = (name) => {
    if (!selectedIngredientKeys.length) return null;
    const ingredientKey = normalizeIngredientKey(name);
    if (!ingredientKey) return null;
    return selectedIngredientKeys.some(
      (selected) =>
        ingredientKey.includes(selected) || selected.includes(ingredientKey)
    );
  };

  const normalizeRecipe = (item) => {
    const isAdminRecipe = Boolean(item.id);
    const ingredients = Array.isArray(item.ingredients)
      ? item.ingredients.map((ingredient, index) => ({
          id: ingredient.id || `${item.id || 'ing'}-${index}`,
          name: ingredient.name || ingredient.title || 'Ingredient',
          amount: formatIngredientAmount(ingredient),
          owned:
            hasSelectedIngredient(ingredient.name || ingredient.title) ??
            Boolean(ingredient.owned),
        }))
      : [];

    const instructions = Array.isArray(item.instructions)
      ? item.instructions
      : Array.isArray(item.steps)
      ? item.steps
      : [];

    const nutrition = item.nutrition || item.nutrition_per_serving || {};

    const prepTimeRaw = item.prep_time_minutes ?? item.prepTime ?? item.prep_time ?? null;
    const cookTimeRaw = item.cook_time_minutes ?? item.cookTime ?? item.cook_time ?? null;
    const prepTime = typeof prepTimeRaw === 'number' ? prepTimeRaw : parseFloat(prepTimeRaw);
    const cookTime = typeof cookTimeRaw === 'number' ? cookTimeRaw : parseFloat(cookTimeRaw);
    const totalTimeRaw = item.total_time ?? item.totalTime ?? item.time ?? null;
    const totalTimeParsed =
      typeof totalTimeRaw === 'number' ? totalTimeRaw : parseFloat(totalTimeRaw);
    const hasPrepCook = Number.isFinite(prepTime) || Number.isFinite(cookTime);
    const totalTime = hasPrepCook
      ? (Number.isFinite(prepTime) ? prepTime : 0) + (Number.isFinite(cookTime) ? cookTime : 0)
      : Number.isFinite(totalTimeParsed)
      ? totalTimeParsed
      : 0;

    return {
      id: item.id || '0',
      title: item.name || item.title || 'Recipe',
      category: item.category || 'Diabetes-Friendly',
      prepTime: Number.isFinite(prepTime) ? prepTime : 0,
      cookTime: Number.isFinite(cookTime) ? cookTime : 0,
      totalTime,
      servings: item.servings || 1,
      difficulty: item.difficulty || 'Easy',
      source: recipeSourceFromRoute || (isAdminRecipe ? 'admin' : 'ai'),
      image: item.image_url || item.image || '',
      imageSource: item.image_source || 'unknown',
      diabetesAnalysis: item.diabetes_analysis || item.diabetesAnalysis || null,
      isBookmarked: Boolean(item.isBookmarked),
      description: item.description || 'A diabetes-friendly recipe curated for balanced nutrition.',
      tips: Array.isArray(item.tips) ? item.tips : [],
      nutrition: {
        calories: nutrition.calories || 0,
        carbs: formatNutritionValue(nutrition.carbs),
        protein: formatNutritionValue(nutrition.protein),
        fat: formatNutritionValue(nutrition.fat),
        fiber: formatNutritionValue(nutrition.fiber),
        sugar: formatNutritionValue(nutrition.sugar),
      },
      ingredients,
      instructions,
      tips: item.tips || mockRecipe.tips,
    };
  };

  const formatIngredientAmount = (ingredient) => {
    if (!ingredient) return '';
    const quantity = ingredient.quantity ? `${ingredient.quantity}` : '';
    const unit = ingredient.unit ? `${ingredient.unit}` : '';
    const base = `${quantity} ${unit}`.trim();
    const note = ingredient.note ? ` (${ingredient.note})` : '';
    return `${base}${note}`.trim();
  };

  const formatNutritionValue = (value) => {
    if (value === null || value === undefined || value === '') return '0g';
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    if (Number.isNaN(numeric)) return `${value}`.includes('g') ? `${value}` : '0g';
    return `${numeric}g`;
  };


  const parseNutritionNumber = (value) => {
    if (value === null || value === undefined || value === '') return null;
    const numeric = typeof value === 'number' ? value : parseFloat(value);
    return Number.isFinite(numeric) ? numeric : null;
  };

  const getSafetyHighlights = () => {
    const carbs = parseNutritionNumber(recipe.nutrition.carbs);
    const fiber = parseNutritionNumber(recipe.nutrition.fiber);
    const sugar = parseNutritionNumber(recipe.nutrition.sugar);
    const protein = parseNutritionNumber(recipe.nutrition.protein);
    const highlights = [];

    if (fiber !== null && fiber >= 5) {
      highlights.push({ icon: 'leaf', text: `High fiber (${fiber}g)` });
    }
    if (sugar !== null && sugar <= 5) {
      highlights.push({ icon: 'water', text: `Low sugar (${sugar}g)` });
    }
    if (protein !== null && protein >= 20) {
      highlights.push({ icon: 'fitness', text: `High protein (${protein}g)` });
    }
    if (protein !== null && protein < 20 && highlights.length < 3) {
      highlights.push({ icon: 'fitness', text: `Protein (${protein}g)` });
    }
    if (!highlights.length) {
      highlights.push({ icon: 'heart', text: 'Balanced nutrition' });
    }
    return highlights.slice(0, 3);
  };

  const getSafetySections = () => {
    const carbs = parseNutritionNumber(recipe.nutrition.carbs);
    const fiber = parseNutritionNumber(recipe.nutrition.fiber);
    const sugar = parseNutritionNumber(recipe.nutrition.sugar);
    const protein = parseNutritionNumber(recipe.nutrition.protein);
    const fat = parseNutritionNumber(recipe.nutrition.fat);
    const calories = parseNutritionNumber(recipe.nutrition.calories);
    const sections = [];

    if (calories !== null) {
      const calorieText =
        calories <= 400
          ? `Calories are ${calories} per serving, a moderate portion that supports steady energy.`
          : `Calories are ${calories} per serving. Consider portion size for blood sugar balance.`;
      sections.push({
        icon: 'flame',
        title: 'Calories Per Serving',
        text: calorieText,
      });
    }
    if (carbs !== null) {
      const carbText =
        carbs <= 30
          ? `Carbs are ${carbs}g per serving, helping reduce rapid blood sugar spikes.`
          : `Carbs are ${carbs}g per serving. Pair with fiber and protein for steadier glucose response.`;
      sections.push({
        icon: 'trending-down',
        title: 'Carbohydrate Impact',
        text: carbText,
      });
    }
    if (fiber !== null && fiber >= 5) {
      sections.push({
        icon: 'leaf',
        title: 'High Fiber Content',
        text: `With ${fiber}g of fiber, this meal supports steadier glucose absorption and fullness.`,
      });
    }
    if (fiber !== null && fiber < 5) {
      sections.push({
        icon: 'leaf',
        title: 'Fiber Support',
        text: `This recipe provides ${fiber}g of fiber per serving to help with steady energy.`,
      });
    }
    if (sugar !== null && sugar <= 5) {
      sections.push({
        icon: 'water',
        title: 'Low Added Sugar',
        text: `Sugar is kept low at ${sugar}g per serving, helping avoid rapid glucose rises.`,
      });
    }
    if (sugar !== null && sugar > 5) {
      sections.push({
        icon: 'water',
        title: 'Moderate Sugar',
        text: `Sugar is ${sugar}g per serving. Consider smaller portions if needed.`,
      });
    }
    if (protein !== null && protein >= 20) {
      sections.push({
        icon: 'fitness',
        title: 'High Protein Balance',
        text: `Protein at ${protein}g per serving supports satiety and balanced energy.`,
      });
    }
    if (protein !== null && protein < 20) {
      sections.push({
        icon: 'fitness',
        title: 'Protein Support',
        text: `Protein is ${protein}g per serving, helping with fullness and steady energy.`,
      });
    }
    if (fat !== null) {
      const fatText =
        fat <= 15
          ? `Fat is ${fat}g per serving, supporting steady energy without excess.`
          : `Fat is ${fat}g per serving. Choose healthy fats and watch portions.`;
      sections.push({
        icon: 'water',
        title: 'Healthy Fat Balance',
        text: fatText,
      });
    }
    if (!sections.length) {
      sections.push({
        icon: 'heart',
        title: 'Balanced Nutrition',
        text: 'This recipe is designed to support blood sugar management using balanced portions.',
      });
    }
    return sections;
  };

  const toggleBookmark = async () => {
    if (recipe.isBookmarked || isSavingFavorite) {
      return;
    }
    try {
      setIsSavingFavorite(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to save favorites.');
        return;
      }
      let recipeToSave = recipe;
      const needsDetails =
        Boolean(recipe.id) &&
        (!recipe.ingredients?.length ||
          (!recipe.prepTime && !recipe.prep_time_minutes) ||
          (!recipe.cookTime && !recipe.cook_time_minutes));
      if (needsDetails) {
        const detailResponse = await apiFetch(
          `${API_URL}${API_ENDPOINTS.RECIPE_DETAIL}/${recipe.id}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut }
        );
        if (detailResponse.ok) {
          const detailData = await detailResponse.json();
          recipeToSave = { ...recipe, ...detailData };
        }
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.FAVORITES}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: recipeToSave.title || recipeToSave.name || recipe.title,
            recipe: {
              ...recipeToSave,
              title: recipeToSave.title || recipeToSave.name || recipe.title,
              image_url: recipeToSave.image_url || recipeToSave.image,
              nutrition: recipeToSave.nutrition || recipeToSave.nutrition_per_serving,
              prep_time_minutes:
                recipeToSave.prep_time_minutes ??
                recipeToSave.prepTime ??
                recipeToSave.prep_time ??
                recipe.prepTime ??
                recipe.prep_time_minutes,
              cook_time_minutes:
                recipeToSave.cook_time_minutes ??
                recipeToSave.cookTime ??
                recipeToSave.cook_time ??
                recipe.cookTime ??
                recipe.cook_time_minutes,
              total_time:
                recipeToSave.total_time ??
                recipeToSave.totalTime ??
                recipeToSave.time ??
                recipe.totalTime ??
                recipe.time,
              ingredients: recipeToSave.ingredients || recipe.ingredients || [],
              instructions: recipeToSave.instructions || recipe.instructions || [],
            },
          }),
        },
        { onUnauthorized: signOut }
      );
      if (response.status === 403) {
        Alert.alert(
          'Premium required',
          'Saving favorites is available on Premium plans.',
          [
            { text: 'OK', style: 'cancel' },
            { text: 'Upgrade', onPress: () => navigation.navigate('Profile') },
          ]
        );
        return;
      }
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        Alert.alert('Unable to save', data?.detail || 'Please try again.');
        return;
      }
      setRecipe({ ...recipe, isBookmarked: true });
      Alert.alert('Saved', 'Recipe added to favorites.');
    } catch (error) {
      Alert.alert('Error', 'Unable to save favorite right now.');
    } finally {
      setIsSavingFavorite(false);
    }
  };

  const handleShare = async () => {
    try {
      const messageParts = [
        `GlucoForager Recipe: ${recipe.title}`,
        recipe.description || 'Diabetes-friendly recipe',
        'Find more at https://glucoforager.com',
      ];
      await Share.share({
        message: messageParts.join('\n\n'),
      });
    } catch (error) {
      Alert.alert('Error', 'Unable to open share sheet.');
    }
  };

  const ownedCount = recipe.ingredients.filter(item => item.owned).length;
  const totalIngredients = recipe.ingredients.length;
  const ingredientProgress = totalIngredients ? (ownedCount / totalIngredients) * 100 : 0;

  const renderHeader = () => (
    <View style={[styles.header, { top: headerTop }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={24} color="#FFF" />
      </TouchableOpacity>
      <View style={styles.headerActions}>
        <TouchableOpacity style={styles.headerIconButton} onPress={handleShare}>
          <Ionicons name="share-social-outline" size={22} color="#FFF" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.headerIconButton} onPress={toggleBookmark}>
          <Ionicons
            name={recipe.isBookmarked ? "bookmark" : "bookmark-outline"}
            size={24}
            color="#FFF"
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderHeroSection = () => (
    <View style={styles.heroContainer}>
      {recipe.image && recipe.imageSource !== 'placeholder' && !imageLoadError ? (
        <Image
          source={{ uri: recipe.image }}
          style={styles.recipeImage}
          onError={() => setImageLoadError(true)}
        />
      ) : (
        <Image source={RecipePlaceholder} style={styles.recipeImage} />
      )}
      <View style={styles.imageOverlay}>
        <View style={styles.heroContent}>
          <View style={styles.recipeBadge}>
            <Text style={styles.badgeText}>{recipe.category}</Text>
          </View>
          <View style={styles.nutritionBadge}>
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionIcon}>🥗</Text>
              <Text style={styles.nutritionValue}>{recipe.nutrition.calories} cal</Text>
            </View>
            <View style={styles.nutritionDivider} />
            <View style={styles.nutritionItem}>
              <Text style={styles.nutritionIcon}>🍞</Text>
              <Text style={styles.nutritionValue}>{recipe.nutrition.carbs} carbs</Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  );

  const renderStatsBar = () => (
    <View style={styles.statsBar}>
      <View style={styles.statItem}>
        <Ionicons name="time-outline" size={20} color="#4CAF50" />
        <Text style={styles.statText}>{recipe.totalTime} mins</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <Feather name="users" size={20} color="#4CAF50" />
        <Text style={styles.statText}>Serves {servings}</Text>
      </View>
      <View style={styles.statDivider} />
      <View style={styles.statItem}>
        <MaterialIcons name="speed" size={20} color="#4CAF50" />
        <Text style={styles.statText}>{recipe.difficulty}</Text>
      </View>
    </View>
  );

  const renderTitleSection = () => (
    <View style={styles.titleSection}>
      <Text style={styles.recipeTitle}>{recipe.title}</Text>
      <Text style={styles.recipeDescription}>{recipe.description}</Text>
    </View>
  );

  const renderSafetySection = () => {
    const highlights = getSafetyHighlights();
    return (
    <TouchableOpacity 
      style={styles.safetyCard}
      onPress={() => setShowSafetyModal(true)}
      activeOpacity={0.9}
    >
      <View style={styles.safetyHeader}>
        <View style={styles.safetyIcon}>
          <FontAwesome name="stethoscope" size={20} color="#FFF" />
        </View>
        <View style={styles.safetyTextContainer}>
          <Text style={styles.safetyTitle}>Why This Is Diabetes-Safe</Text>
          <Text style={styles.safetySubtitle}>Based on nutrition per serving</Text>
        </View>
        <Ionicons name="chevron-forward" size={20} color="#4CAF50" />
      </View>
      
      <View style={styles.safetyHighlights}>
        {highlights.map((item, index) => (
          <View key={`${item.text}-${index}`} style={styles.highlightItem}>
            <Ionicons name={item.icon} size={16} color="#4CAF50" />
            <Text style={styles.highlightText}>{item.text}</Text>
          </View>
        ))}
      </View>
    </TouchableOpacity>
    );
  };

  const renderIngredientsSection = () => (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Ingredients</Text>
        <TouchableOpacity 
          style={styles.viewAllButton}
          onPress={() => setShowIngredientsModal(true)}
        >
          <Text style={styles.viewAllText}>View All</Text>
        </TouchableOpacity>
      </View>
      
      <View style={styles.ingredientsProgress}>
        <View style={styles.progressContainer}>
          <View style={styles.progressLabel}>
            <Text style={styles.progressText}>
              You have: {ownedCount} of {totalIngredients} ingredients
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View 
              style={[
                styles.progressFill, 
                { width: `${ingredientProgress}%` }
              ]} 
            />
          </View>
        </View>
      </View>
      
      <View style={styles.ingredientsGrid}>
        {recipe.ingredients.length === 0 ? (
          <Text style={styles.emptyText}>No ingredients listed yet.</Text>
        ) : (
          recipe.ingredients.slice(0, 6).map((item) => (
          <View key={item.id} style={styles.ingredientCard}>
            <View style={styles.ingredientHeader}>
              {item.owned ? (
                <View style={styles.ownedIndicator}>
                  <Ionicons name="checkmark-circle" size={18} color="#4CAF50" />
                </View>
              ) : (
                <View style={styles.missingIndicator}>
                  <View style={styles.missingDot} />
                </View>
              )}
              <Text style={styles.ingredientName} numberOfLines={1}>
                {item.name}
              </Text>
            </View>
            <Text style={styles.ingredientAmount}>{item.amount}</Text>
          </View>
          ))
        )}
      </View>
    </View>
  );

  const renderInstructionsSection = () => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Instructions</Text>
      
      <View style={styles.instructionsList}>
      {recipe.instructions.length === 0 ? (
        <Text style={styles.emptyText}>No instructions available for this recipe yet.</Text>
      ) : (
        recipe.instructions.map((step, index) => (
          <View key={index} style={styles.instructionStep}>
            <View style={styles.stepNumber}>
              <Text style={styles.stepNumberText}>{index + 1}</Text>
            </View>
            <Text style={styles.stepText}>{step}</Text>
          </View>
        ))
      )}
      </View>
    </View>
  );

  const renderTipsSection = () => {
    if (recipe.source === 'admin') {
      return null;
    }
    return (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Diabetes Management Tips</Text>
        
        <View style={styles.tipsContainer}>
          {recipe.tips.map((tip, index) => (
            <TouchableOpacity
              key={index}
              style={styles.tipCard}
              onPress={() => setExpandedTip(expandedTip === index ? null : index)}
              activeOpacity={0.8}
            >
              <View style={styles.tipHeader}>
                <View style={styles.tipIcon}>
                  <Ionicons name="medical" size={18} color="#4CAF50" />
                </View>
                <Text style={styles.tipTitle}>Tip {index + 1}</Text>
                <Ionicons 
                  name={expandedTip === index ? "chevron-up" : "chevron-down"} 
                  size={18} 
                  color="#666" 
                />
              </View>
              {expandedTip === index && (
                <Text style={styles.tipContent}>{tip}</Text>
              )}
            </TouchableOpacity>
          ))}
          {recipe.tips.length === 0 && (
            <Text style={styles.emptyText}>No tips available for this recipe yet.</Text>
          )}
        </View>
      </View>
    );
  };

  const renderNutritionSection = () => {
    const nutritionCards = [
      { label: 'Calories', value: `${recipe.nutrition.calories} cal` },
      { label: 'Carbs', value: recipe.nutrition.carbs },
      { label: 'Protein', value: recipe.nutrition.protein },
      { label: 'Fat', value: recipe.nutrition.fat },
      { label: 'Fiber', value: recipe.nutrition.fiber },
      { label: 'Sugar', value: recipe.nutrition.sugar },
    ];

    return (
      <View style={[styles.section, styles.sectionLast]}>
        <Text style={styles.sectionTitle}>Nutrition Facts</Text>

        <View style={styles.nutritionGrid}>
          {nutritionCards.map((item) => (
            <View key={item.label} style={styles.nutritionCard}>
              <Text style={styles.nutritionValue}>{item.value}</Text>
              <Text style={styles.nutritionLabel}>{item.label}</Text>
            </View>
          ))}
        </View>

        <View style={styles.recipeActions}>
          <TouchableOpacity style={styles.secondaryActionButton} onPress={handleShare}>
            <Ionicons name="share-social-outline" size={18} color="#4CAF50" />
            <Text style={styles.secondaryActionText}>Share</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={toggleBookmark}
            disabled={isSavingFavorite}
          >
            <Ionicons
              name={recipe.isBookmarked ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color="#FFF"
            />
            <Text style={styles.primaryActionText}>
              {recipe.isBookmarked ? 'Saved' : 'Add to Favorites'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const renderSafetyModal = () => {
    const sections = getSafetySections();
    return (
    <Modal
      visible={showSafetyModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowSafetyModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Diabetes Safety Guide</Text>
            <TouchableOpacity onPress={() => setShowSafetyModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {sections.map((section, index) => (
              <View key={`${section.title}-${index}`}>
                <View style={styles.modalSection}>
                  <View style={styles.modalIcon}>
                    <Ionicons name={section.icon} size={28} color="#4CAF50" />
                  </View>
                  <Text style={styles.modalSectionTitle}>{section.title}</Text>
                  <Text style={styles.modalSectionText}>{section.text}</Text>
                </View>
                {index < sections.length - 1 && <View style={styles.modalDivider} />}
              </View>
            ))}
          </ScrollView>
          
          <TouchableOpacity 
            style={[styles.modalButton, { marginBottom: Math.max(insets.bottom, 16) }]}
            onPress={() => setShowSafetyModal(false)}
          >
            <Text style={styles.modalButtonText}>Got It!</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
    );
  };

  const renderIngredientsModal = () => (
    <Modal
      visible={showIngredientsModal}
      animationType="slide"
      transparent={true}
      onRequestClose={() => setShowIngredientsModal(false)}
    >
      <View style={styles.modalContainer}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>All Ingredients</Text>
            <TouchableOpacity onPress={() => setShowIngredientsModal(false)}>
              <Ionicons name="close" size={24} color="#333" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {recipe.ingredients.map((item) => (
              <View key={item.id} style={styles.modalIngredientItem}>
                <View style={styles.modalIngredientInfo}>
                  {item.owned ? (
                    <Ionicons name="checkmark-circle" size={22} color="#4CAF50" />
                  ) : (
                    <View style={styles.modalMissingIcon} />
                  )}
                  <View style={styles.modalIngredientText}>
                    <Text style={styles.modalIngredientName}>{item.name}</Text>
                    <Text style={styles.modalIngredientAmount}>{item.amount}</Text>
                  </View>
                </View>
                <View style={[
                  styles.ownershipBadge,
                  item.owned ? styles.ownedBadge : styles.neededBadge
                ]}>
                  <Text style={[
                    styles.ownershipText,
                    item.owned ? styles.ownedText : styles.neededText
                  ]}>
                    {item.owned ? 'Owned' : 'Need'}
                  </Text>
                </View>
              </View>
            ))}
          </ScrollView>
          
          <TouchableOpacity 
            style={styles.modalButton}
            onPress={() => setShowIngredientsModal(false)}
          >
            <Text style={styles.modalButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );

  return (
    <SafeAreaView style={styles.container}>
      {renderHeader()}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding }}
      >
        {renderHeroSection()}
        <View style={styles.content}>
          {renderStatsBar()}
          {renderTitleSection()}
          {renderSafetySection()}
          {renderIngredientsSection()}
          {renderInstructionsSection()}
          {renderTipsSection()}
          {renderNutritionSection()}
        </View>
      </ScrollView>
      
      {renderSafetyModal()}
      {renderIngredientsModal()}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFF',
  },
  header: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
  },
  headerIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    backdropFilter: 'blur(10px)',
  },
  heroContainer: {
    height: 320,
    position: 'relative',
  },
  recipeImage: {
    width: '100%',
    height: '100%',
  },
  recipeImagePlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'flex-end',
  },
  heroContent: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  recipeBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.9)',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginBottom: 10,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  nutritionBadge: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 16,
    padding: 12,
    alignSelf: 'flex-start',
  },
  nutritionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  nutritionIcon: {
    fontSize: 16,
    marginRight: 4,
  },
  nutritionValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
  },
  nutritionDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E0E0E0',
  },
  content: {
    flex: 1,
  },
  statsBar: {
    flexDirection: 'row',
    backgroundColor: '#F8FDF9',
    marginHorizontal: 20,
    marginTop: -20,
    borderRadius: 16,
    paddingVertical: 16,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  statText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2E7D32',
    marginLeft: 6,
  },
  statDivider: {
    width: 1,
    height: '100%',
    backgroundColor: '#E8F5E9',
  },
  titleSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  recipeTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 8,
    lineHeight: 34,
  },
  recipeDescription: {
    fontSize: 16,
    color: '#666',
    lineHeight: 24,
    marginBottom: 20,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorAvatar: {
    marginRight: 12,
  },
  authorInfo: {
    flex: 1,
  },
  authorName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 2,
  },
  authorRole: {
    fontSize: 14,
    color: '#4CAF50',
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  ratingText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginLeft: 4,
    marginRight: 4,
  },
  reviewCount: {
    fontSize: 12,
    color: '#666',
  },
  safetyCard: {
    backgroundColor: '#F8FDF9',
    marginHorizontal: 20,
    marginBottom: 24,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  safetyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  safetyIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  safetyTextContainer: {
    flex: 1,
  },
  safetyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 2,
  },
  safetySubtitle: {
    fontSize: 14,
    color: '#666',
  },
  safetyHighlights: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  highlightItem: {
    alignItems: 'center',
  },
  highlightText: {
    fontSize: 12,
    color: '#4CAF50',
    marginTop: 4,
    fontWeight: '500',
  },
  section: {
    paddingHorizontal: 20,
    marginBottom: 28,
  },
  sectionLast: {
    marginBottom: 0,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: '#1B5E20',
  },
  viewAllButton: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  viewAllText: {
    fontSize: 14,
    color: '#4CAF50',
    fontWeight: '600',
  },
  ingredientsProgress: {
    marginBottom: 20,
  },
  progressContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
  },
  progressLabel: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  progressBar: {
    height: 6,
    backgroundColor: '#E0E0E0',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#4CAF50',
    borderRadius: 3,
  },
  ingredientsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  ingredientCard: {
    width: '48%',
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  ingredientHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  ownedIndicator: {
    marginRight: 8,
  },
  missingIndicator: {
    marginRight: 8,
  },
  missingDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#FF9800',
  },
  ingredientName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  ingredientAmount: {
    fontSize: 13,
    color: '#4CAF50',
    fontWeight: '600',
  },
  emptyText: {
    fontSize: 14,
    color: '#666',
    paddingVertical: 8,
  },
  instructionStep: {
    flexDirection: 'row',
    marginBottom: 20,
    backgroundColor: '#F8FDF9',
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#4CAF50',
  },
  instructionsList: {
    marginTop: 12,
  },
  stepNumber: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    flexShrink: 0,
  },
  stepNumberText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
  stepText: {
    flex: 1,
    fontSize: 15,
    color: '#333',
    lineHeight: 22,
  },
  tipsContainer: {
    marginTop: 8,
  },
  tipCard: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  tipHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  tipTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  tipContent: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  nutritionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  nutritionCard: {
    width: '31%',
    backgroundColor: '#F8FDF9',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    marginBottom: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E8F5E9',
  },
  nutritionValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1B5E20',
    marginBottom: 4,
  },
  nutritionLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 2,
    textAlign: 'center',
    width: '100%',
  },
  recipeActions: {
    flexDirection: 'row',
    marginTop: 16,
    gap: 12,
  },
  secondaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8E9',
  },
  secondaryActionText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#4CAF50',
  },
  primaryActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
  },
  primaryActionText: {
    marginLeft: 8,
    fontSize: 15,
    fontWeight: '600',
    color: '#FFF',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1B5E20',
  },
  modalBody: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  modalSection: {
    marginBottom: 16,
  },
  modalIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#333',
    marginBottom: 8,
  },
  modalSectionText: {
    fontSize: 15,
    color: '#666',
    lineHeight: 22,
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 20,
  },
  modalButton: {
    backgroundColor: '#4CAF50',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  modalButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFF',
  },
  modalIngredientItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  modalIngredientInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalMissingIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#FF9800',
  },
  modalIngredientText: {
    marginLeft: 12,
    flex: 1,
  },
  modalIngredientName: {
    fontSize: 16,
    color: '#333',
    marginBottom: 2,
  },
  modalIngredientAmount: {
    fontSize: 14,
    color: '#666',
  },
  ownershipBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  ownedBadge: {
    backgroundColor: '#E8F5E9',
  },
  neededBadge: {
    backgroundColor: '#FFF3E0',
  },
  ownershipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ownedText: {
    color: '#4CAF50',
  },
  neededText: {
    color: '#FF9800',
  },
});

export default RecipeDetailsScreen;
