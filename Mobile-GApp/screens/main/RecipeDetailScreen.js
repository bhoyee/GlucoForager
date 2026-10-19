import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  Pressable,
  Share,
  Alert,
  StyleSheet,
  Dimensions,
  Modal,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons, MaterialIcons, FontAwesome, Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { getRecipeImageSettings } from '../../utils/recipeImageSettings';
import { trackEvent } from '../../utils/analytics';
import { confirmMealLogged } from '../../utils/mealLogConfirm';
import { generateIdempotencyKey } from '../../utils/idempotency';
import { getCachedRecipeImageUrl, setCachedRecipeImageUrl } from '../../utils/recipeImageCache';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import RecipePlaceholder from '../../assets/images/recipe-placeholder.jpeg';
import { Colors } from '../../constants/Colors';

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
    { id: '5', name: 'Red onion', amount: '1/2 cup', owned: false },
    { id: '6', name: 'Kalamata olives', amount: '1/4 cup', owned: false },
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
  const [detailsTab, setDetailsTab] = useState('ingredients'); // 'nutrition' | 'ingredients' | 'instructions'
  const [servings, setServings] = useState(recipe.servings);
  const [expandedTip, setExpandedTip] = useState(null);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);
  const [recipeImagesEnabled, setRecipeImagesEnabled] = useState(true);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [checkInFeeling, setCheckInFeeling] = useState(null);
  const [isSubmittingCheckIn, setIsSubmittingCheckIn] = useState(false);
  // "I ate this": logs the recipe as a meal with its exact carbs per serving.
  const [ateLogged, setAteLogged] = useState(false);
  const [isLoggingAte, setIsLoggingAte] = useState(false);
  const [isAddingToShoppingList, setIsAddingToShoppingList] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    const hydrateFromCache = async () => {
      const current = `${recipe?.image_url || recipe?.image || ''}`.trim();
      if (current) return;
      const cached = await getCachedRecipeImageUrl(recipe);
      if (!cancelled && cached) {
        setImageLoadError(false);
        setRecipe((prev) => ({
          ...prev,
          image: cached,
          image_url: cached,
          imageSource: prev?.imageSource || prev?.image_source || 'ai',
          image_source: prev?.image_source || prev?.imageSource || 'ai',
        }));
      }
    };
    hydrateFromCache();
    return () => {
      cancelled = true;
    };
  }, [recipe?.title, recipe?.ingredients?.length]);

  useEffect(() => {
    let cancelled = false;
    const loadTodayCheckIn = async () => {
      if (!route.params?.recipe || !recipe?.title) return;
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) return;
        const ingredientNames = Array.isArray(recipe.ingredients)
          ? recipe.ingredients.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean)
          : [];
        const queryParts = [
          `title=${encodeURIComponent(recipe.title)}`,
          ...ingredientNames.map((name) => `ingredients=${encodeURIComponent(name)}`),
        ];
        const response = await apiFetch(
          `${API_URL}${API_ENDPOINTS.RECIPE_CHECK_IN_TODAY}?${queryParts.join('&')}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut, timeoutMs: 8000 }
        );
        if (cancelled || !response.ok) return;
        const data = await response.json().catch(() => ({}));
        if (data?.feeling) {
          setCheckInFeeling(data.feeling);
        }
      } catch (error) {
        // Non-critical: check-in card just falls back to showing the picker.
      }
    };
    loadTodayCheckIn();
    return () => {
      cancelled = true;
    };
  }, [recipe?.title, recipe?.ingredients?.length]);

  const handleGenerateImage = async () => {
    if (isGeneratingImage) return;
    try {
      setIsGeneratingImage(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to generate recipe images.');
        return;
      }

      const ingredients = Array.isArray(recipe.ingredients)
        ? recipe.ingredients
            .map((item) => (typeof item === 'string' ? item : item?.name))
            .filter(Boolean)
        : [];

      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.AI_RECIPES_IMAGE}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: recipe.title,
            description: recipe.description,
            ingredients,
          }),
        },
        { onUnauthorized: signOut, timeoutMs: 60000 }
      );

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = data?.detail || 'Unable to generate image right now.';
        Alert.alert('Image generation', detail);
        return;
      }

      if (data?.image_url) {
        setImageLoadError(false);
        await setCachedRecipeImageUrl(recipe, data.image_url);
        setRecipe((prev) => ({
          ...prev,
          image: data.image_url,
          image_url: data.image_url,
          imageSource: data.image_source || 'ai',
          image_source: data.image_source || 'ai',
        }));

        // Best-effort: refresh cached recent recipes so the Home list can show the new thumbnail immediately.
        try {
          const recentResponse = await apiFetch(
            `${API_URL}${API_ENDPOINTS.RECENT_RECIPES}`,
            { headers: { Authorization: `Bearer ${token}` } },
            { onUnauthorized: signOut, timeoutMs: 5000 }
          );
          const recentData = await recentResponse.json().catch(() => ({}));
          const recentItems = Array.isArray(recentData.items) ? recentData.items : [];
          await AsyncStorage.setItem('home_recent_recipes', JSON.stringify(recentItems));
        } catch (e) {
          // Ignore cache refresh errors.
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Unable to generate image right now.');
    } finally {
      setIsGeneratingImage(false);
    }
  };


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

  const cleanInstructionText = (value) => {
    const text = `${value || ''}`
      .replace(/\s+/g, ' ')
      .replace(/^(step|instruction|method)\s*\d*\s*[:.)-]?\s*/i, '')
      .trim();
    if (!text || /^instruction\s*\d*$/i.test(text) || /^step\s*\d*$/i.test(text)) {
      return '';
    }
    return text;
  };

  const splitInstructionText = (value) => {
    if (typeof value !== 'string') return [];
    const raw = value.trim();
    if (!raw) return [];
    const lines = raw
      .split(/\r?\n+/)
      .map(cleanInstructionText)
      .filter(Boolean);
    if (lines.length > 1) return lines;

    return raw
      .split(/(?=\b(?:step|instruction)\s*\d+\s*[:.)-])|(?=\s\d+\s*[.)]\s+)/i)
      .map(cleanInstructionText)
      .filter(Boolean);
  };

  const normalizeInstructions = (item) => {
    const source =
      item.instructions ??
      item.steps ??
      item.method ??
      item.directions ??
      item.preparation ??
      [];
    const rawSteps = Array.isArray(source) ? source : [source];
    const steps = [];

    rawSteps.forEach((step) => {
      if (typeof step === 'string') {
        steps.push(...splitInstructionText(step));
        return;
      }
      if (step && typeof step === 'object') {
        const text =
          step.text ||
          step.step ||
          step.instruction ||
          step.description ||
          step.direction ||
          '';
        const cleaned = cleanInstructionText(text);
        if (cleaned) steps.push(cleaned);
      }
    });

    return steps.filter(Boolean);
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

    const instructions = normalizeInstructions(item);

    const nutrition =
      item.nutrition ||
      item.nutrition_per_serving ||
      item.nutritional_info ||
      item.nutritionPerServing ||
      {};

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
      trackEvent('recipe_favorited');
      Alert.alert('Saved', 'Recipe added to favorites.');
    } catch (error) {
      Alert.alert('Error', 'Unable to save favorite right now.');
    } finally {
      setIsSavingFavorite(false);
    }
  };

  const handleAteThis = async () => {
    if (isLoggingAte || ateLogged) return;
    setIsLoggingAte(true);
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to log a meal.');
        return;
      }
      const carbs = parseNutritionNumber(recipe?.nutrition?.carbs);
      const title = String(recipe?.title || 'Recipe').slice(0, 200);
      const response = await apiFetch(
        `${API_URL}/api/app/meals`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: title,
            source: 'recipe',
            food_name: title.slice(0, 80),
            ...(carbs != null ? { carbs_g: carbs } : {}),
            carbs_estimated: false,
            idempotency_key: generateIdempotencyKey(),
          }),
        },
        { onUnauthorized: signOut, timeoutMs: 8000 }
      );
      if (!response.ok) {
        Alert.alert('Unable to log meal', 'Please try again.');
        return;
      }
      const data = await response.json().catch(() => ({}));
      setAteLogged(true);
      trackEvent('meal_logged', { source: 'recipe', has_carbs: carbs != null, carbs_estimated: false });
      if (!data?.duplicate) {
        await confirmMealLogged({ name: title, loggedAt: data?.meal?.logged_at, carbs, carbsEstimated: false });
      }
    } catch {
      Alert.alert('Unable to log meal', 'Network request failed. Please check your connection.');
    } finally {
      setIsLoggingAte(false);
    }
  };

  const handleCheckIn = async (feeling) => {
    if (isSubmittingCheckIn || checkInFeeling) return;
    try {
      setIsSubmittingCheckIn(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to log how a recipe made you feel.');
        return;
      }
      const ingredientNames = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean)
        : [];
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.RECIPE_CHECK_IN}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: recipe.title,
            ingredients: ingredientNames,
            feeling,
          }),
        },
        { onUnauthorized: signOut }
      );
      if (!response.ok) {
        Alert.alert('Error', 'Unable to log this right now. Please try again.');
        return;
      }
      setCheckInFeeling(feeling);
    } catch (error) {
      Alert.alert('Error', 'Unable to log this right now. Please try again.');
    } finally {
      setIsSubmittingCheckIn(false);
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

  const handleAddToShoppingList = async () => {
    if (isAddingToShoppingList) return;
    try {
      setIsAddingToShoppingList(true);
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to save a shopping list.');
        return;
      }
      const ingredientNames = Array.isArray(recipe.ingredients)
        ? recipe.ingredients.map((item) => (typeof item === 'string' ? item : item?.name)).filter(Boolean)
        : [];
      if (!ingredientNames.length) {
        Alert.alert('No ingredients', 'This recipe has no ingredients to add yet.');
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.SHOPPING_LIST}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: recipe.title, items: ingredientNames }),
        },
        { onUnauthorized: signOut }
      );
      if (!response.ok) {
        Alert.alert('Error', 'Unable to save shopping list right now.');
        return;
      }
      Alert.alert('Added', 'Ingredients saved to your shopping list.', [
        { text: 'OK', style: 'cancel' },
        {
          text: 'View list',
          onPress: () => navigation.navigate('Profile', { screen: 'ShoppingList' }),
        },
      ]);
    } catch (error) {
      Alert.alert('Error', 'Unable to save shopping list right now.');
    } finally {
      setIsAddingToShoppingList(false);
    }
  };

  const ownedCount = recipe.ingredients.filter(item => item.owned).length;
  const totalIngredients = recipe.ingredients.length;
  const ingredientProgress = totalIngredients ? (ownedCount / totalIngredients) * 100 : 0;

  const renderHeader = () => (
    <View style={[styles.header, { top: headerTop }]}>
      <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
        <Ionicons name="arrow-back" size={22} color="#FFF" />
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

  // Bottom actions: one colour each so they're easy to tell apart.
  const ACTION_THEMES = {
    save: { color: '#1D7C7A', bg: '#E8F4F3', border: '#CDE7E4' },
    shop: { color: '#DD6B20', bg: '#FFF1E6', border: '#F8D9BD' },
    share: { color: '#6B46C1', bg: '#F0EBFB', border: '#DDD3F5' },
  };

  // Nutrition tiles: carbs first and largest (what matters most here), the rest colour-coded.
  const NUTRITION_THEME = {
    Calories: { icon: 'flame', color: '#DD6B20', bg: '#FFF1E6' },
    Protein: { icon: 'barbell', color: '#6B46C1', bg: '#F0EBFB' },
    Fat: { icon: 'water', color: '#B7791F', bg: '#FFF8E6' },
    Fiber: { icon: 'leaf', color: '#2C8632', bg: '#E9F6EA' },
    Sugar: { icon: 'cube', color: '#C53030', bg: '#FDECEC' },
  };

  const renderHeroSection = () => (
    <View style={styles.heroContainer}>
      {recipe.image && recipe.imageSource !== 'placeholder' && !imageLoadError ? (
        <Image source={{ uri: recipe.image }} style={styles.recipeImage} onError={() => setImageLoadError(true)} />
      ) : (
        <Image source={RecipePlaceholder} style={styles.recipeImage} />
      )}
      {/* Top and bottom shading so the buttons and the sheet edge read on any photo. */}
      <LinearGradient colors={['rgba(0,0,0,0.45)', 'transparent']} style={styles.heroShadeTop} pointerEvents="none" />
      <LinearGradient colors={['transparent', 'rgba(0,0,0,0.35)']} style={styles.heroShadeBottom} pointerEvents="none" />
      {recipeImagesEnabled && (recipe.imageSource === 'placeholder' || !recipe.image || imageLoadError) ? (
        <View pointerEvents="box-none" style={styles.generateImageOverlay}>
          <TouchableOpacity
            style={[styles.generateImageButton, styles.generateImageOverlayButton, isGeneratingImage ? styles.generateImageButtonDisabled : null]}
            onPress={handleGenerateImage}
            disabled={isGeneratingImage}
            activeOpacity={0.9}
          >
            <Ionicons name="sparkles" size={15} color={Colors.primary} />
            <Text style={styles.generateImageButtonText}>{isGeneratingImage ? 'Generating...' : 'Generate image'}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );

  const renderStatsBar = () => (
    <View style={styles.pStatsRow}>
      {[
        { icon: 'time', text: `${recipe.totalTime} mins`, color: '#1D7C7A', bg: '#E8F4F3' },
        { icon: 'people', text: `Serves ${servings}`, color: '#2B6CB0', bg: '#E6F0FB' },
        { icon: 'speedometer', text: recipe.difficulty, color: '#DD6B20', bg: '#FFF1E6' },
      ].map((stat) => (
        <View key={stat.icon} style={[styles.pStatPill, { backgroundColor: stat.bg }]}>
          <Ionicons name={stat.icon} size={15} color={stat.color} />
          <Text style={[styles.pStatText, { color: stat.color }]} numberOfLines={1}>
            {stat.text}
          </Text>
        </View>
      ))}
    </View>
  );

  const renderTitleSection = () => (
    <View style={styles.pTitleBlock}>
      <Text style={styles.pTitle}>{recipe.title}</Text>
      {recipe.description ? <Text style={styles.pDescription}>{recipe.description}</Text> : null}
    </View>
  );

  const renderSafetySection = () => {
    const highlights = getSafetyHighlights();
    return (
      <TouchableOpacity style={styles.pSafetyShadow} onPress={() => setShowSafetyModal(true)} activeOpacity={0.9}>
        <LinearGradient colors={['#E2F4E3', '#F4FBF4']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pSafetyCard}>
          <View style={styles.pSafetyHead}>
            <View style={styles.pSafetyIcon}>
              <Ionicons name="shield-checkmark" size={20} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pSafetyTitle}>Why this suits diabetes</Text>
              <Text style={styles.pSafetySubtitle}>Based on nutrition per serving</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color="#2C8632" />
          </View>
          <View style={styles.pSafetyChips}>
            {highlights.map((item, index) => (
              <View key={`${item.text}-${index}`} style={styles.pSafetyChip}>
                <Ionicons name={item.icon} size={14} color="#2C8632" />
                <Text style={styles.pSafetyChipText}>{item.text}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderDetailsTabs = () => (
    <View style={styles.pTabs}>
      {[
        { key: 'ingredients', label: 'Ingredients' },
        { key: 'instructions', label: 'Steps' },
        { key: 'nutrition', label: 'Nutrition' },
      ].map((tab) => {
        const active = detailsTab === tab.key;
        return (
          <Pressable key={tab.key} style={[styles.pTab, active && styles.pTabActive]} onPress={() => setDetailsTab(tab.key)}>
            <Text style={[styles.pTabText, active && styles.pTabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderActiveDetailsSection = () => {
    if (detailsTab === 'nutrition') {
      return (
        <>
          {renderNutritionSection()}
          {renderTipsSection()}
        </>
      );
    }
    if (detailsTab === 'instructions') return renderInstructionsSection();
    return renderIngredientsSection();
  };

  const renderIngredientsSection = () => (
    <View style={styles.pCard}>
      <View style={styles.pCardHead}>
        <Text style={styles.pCardTitle}>Ingredients</Text>
        {recipe.ingredients.length > 6 ? (
          <TouchableOpacity onPress={() => setShowIngredientsModal(true)} hitSlop={8}>
            <Text style={styles.pLink}>View all {recipe.ingredients.length}</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {totalIngredients ? (
        <View style={styles.pHaveBox}>
          <Text style={styles.pHaveText}>
            You have <Text style={styles.pHaveStrong}>{ownedCount} of {totalIngredients}</Text> ingredients
          </Text>
          <View style={styles.pProgressTrack}>
            <LinearGradient
              colors={['#35C0BD', '#1D7C7A']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={[styles.pProgressFill, { width: `${ingredientProgress}%` }]}
            />
          </View>
        </View>
      ) : null}
      {recipe.ingredients.length === 0 ? (
        <Text style={styles.emptyText}>No ingredients listed yet.</Text>
      ) : (
        recipe.ingredients.slice(0, 6).map((item, index, list) => (
          <View key={item.id} style={[styles.pIngRow, index === list.length - 1 && { borderBottomWidth: 0 }]}>
            <View style={[styles.pIngCheck, item.owned ? styles.pIngOwned : styles.pIngNeeded]}>
              <Ionicons name={item.owned ? 'checkmark' : 'add'} size={14} color={item.owned ? 'white' : '#DD6B20'} />
            </View>
            <Text style={styles.pIngName} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.pIngAmount}>{item.amount}</Text>
          </View>
        ))
      )}
    </View>
  );

  const renderInstructionsSection = () => (
    <View style={styles.pCard}>
      <View style={styles.pCardHead}>
        <Text style={styles.pCardTitle}>Steps</Text>
        {recipe.instructions.length ? <Text style={styles.pCardMeta}>{recipe.instructions.length} steps</Text> : null}
      </View>
      {recipe.instructions.length === 0 ? (
        <Text style={styles.emptyText}>No instructions available for this recipe yet.</Text>
      ) : (
        recipe.instructions.map((step, index) => (
          <View key={index} style={styles.pStep}>
            <View style={styles.pStepRail}>
              <LinearGradient colors={['#23807E', '#0B5A46']} style={styles.pStepNum}>
                <Text style={styles.pStepNumText}>{index + 1}</Text>
              </LinearGradient>
              {index < recipe.instructions.length - 1 ? <View style={styles.pStepLine} /> : null}
            </View>
            <Text style={styles.pStepText}>{step}</Text>
          </View>
        ))
      )}
    </View>
  );

  const renderTipsSection = () => {
    if (recipe.source === 'admin') return null;
    if (!Array.isArray(recipe.tips) || recipe.tips.length === 0) return null;
    return (
      <View style={styles.pCard}>
        <Text style={[styles.pCardTitle, { marginBottom: 10 }]}>Tips for steady glucose</Text>
        {recipe.tips.map((tip, index) => {
          const open = expandedTip === index;
          return (
            <TouchableOpacity
              key={index}
              style={[styles.pTip, open && styles.pTipOpen]}
              onPress={() => setExpandedTip(open ? null : index)}
              activeOpacity={0.85}
            >
              <View style={styles.pTipHead}>
                <View style={styles.pTipIcon}>
                  <Ionicons name="bulb" size={15} color="#DD6B20" />
                </View>
                <Text style={styles.pTipTitle} numberOfLines={open ? undefined : 1}>
                  {open ? `Tip ${index + 1}` : tip}
                </Text>
                <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={16} color={Colors.textLight} />
              </View>
              {open ? <Text style={styles.pTipText}>{tip}</Text> : null}
            </TouchableOpacity>
          );
        })}
      </View>
    );
  };

  const renderNutritionSection = () => {
    const others = [
      { label: 'Calories', value: `${recipe.nutrition.calories} cal` },
      { label: 'Protein', value: recipe.nutrition.protein },
      { label: 'Fat', value: recipe.nutrition.fat },
      { label: 'Fiber', value: recipe.nutrition.fiber },
      { label: 'Sugar', value: recipe.nutrition.sugar },
    ];
    return (
      <View style={styles.pCard}>
        <View style={styles.pCardHead}>
          <Text style={styles.pCardTitle}>Nutrition</Text>
          <Text style={styles.pCardMeta}>per serving</Text>
        </View>
        <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pCarbHero}>
          <View>
            <Text style={styles.pCarbLabel}>Carbs</Text>
            <Text style={styles.pCarbValue}>{recipe.nutrition.carbs}</Text>
          </View>
          <View style={styles.pCarbIcon}>
            <Ionicons name="nutrition" size={22} color="white" />
          </View>
        </LinearGradient>
        <View style={styles.pNutriGrid}>
          {others.map((item) => {
            const theme = NUTRITION_THEME[item.label];
            return (
              <View key={item.label} style={[styles.pNutriTile, { backgroundColor: theme.bg }]}>
                <Ionicons name={theme.icon} size={15} color={theme.color} />
                <Text style={styles.pNutriValue}>{item.value}</Text>
                <Text style={[styles.pNutriLabel, { color: theme.color }]}>{item.label}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
  };

  const renderCheckInSection = () => {
    const options = [
      { key: 'great', emoji: '🙂', label: 'Great' },
      { key: 'ok', emoji: '😐', label: 'OK' },
      { key: 'not_great', emoji: '🙁', label: 'Not great' },
    ];
    const recipeCarbs = parseNutritionNumber(recipe?.nutrition?.carbs);
    return (
      <View style={styles.pCard}>
        {ateLogged ? (
          <View style={styles.pLoggedRow}>
            <Ionicons name="checkmark-circle" size={22} color="#2C8632" />
            <Text style={styles.pLoggedText}>
              Logged as a meal{recipeCarbs != null ? ` · ${Math.round(recipeCarbs)}g carbs` : ''}
            </Text>
          </View>
        ) : (
          <TouchableOpacity onPress={handleAteThis} disabled={isLoggingAte} activeOpacity={0.9} style={styles.pAteShadow}>
            <LinearGradient colors={['#3FA046', '#2C8632']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pAteButton}>
              {isLoggingAte ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Ionicons name="restaurant" size={18} color="white" />
                  <Text style={styles.pAteText}>I ate this{recipeCarbs != null ? ` · ${Math.round(recipeCarbs)}g carbs` : ''}</Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        )}
        <Text style={styles.pAteHint}>Adds it to today's carbs and reminds you to check your glucose in 2 hours.</Text>
        <View style={styles.pDivider} />
        {checkInFeeling ? (
          <View style={styles.pLoggedRow}>
            <Ionicons name="heart" size={20} color={Colors.primary} />
            <Text style={styles.pLoggedText}>
              Thanks, you felt {options.find((o) => o.key === checkInFeeling)?.label?.toLowerCase() || checkInFeeling}
            </Text>
          </View>
        ) : (
          <>
            <Text style={styles.pFeelTitle}>How did it make you feel?</Text>
            <View style={styles.pFeelRow}>
              {options.map((option) => (
                <TouchableOpacity
                  key={option.key}
                  style={styles.pFeelOption}
                  onPress={() => handleCheckIn(option.key)}
                  disabled={isSubmittingCheckIn}
                  activeOpacity={0.85}
                >
                  <Text style={styles.pFeelEmoji}>{option.emoji}</Text>
                  <Text style={styles.pFeelLabel}>{option.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}
      </View>
    );
  };

  const renderActionsSection = () => (
    <>
      {renderCheckInSection()}
      <View style={styles.pActionsRow}>
        {[
          {
            key: 'save',
            icon: recipe.isBookmarked ? 'bookmark' : 'bookmark-outline',
            label: recipe.isBookmarked ? 'Saved' : 'Save',
            onPress: toggleBookmark,
            disabled: isSavingFavorite,
            on: recipe.isBookmarked,
            ...ACTION_THEMES.save,
          },
          {
            key: 'shop',
            icon: 'cart-outline',
            label: isAddingToShoppingList ? 'Adding…' : 'Shopping list',
            onPress: handleAddToShoppingList,
            disabled: isAddingToShoppingList,
            ...ACTION_THEMES.shop,
          },
          { key: 'share', icon: 'share-social-outline', label: 'Share', onPress: handleShare, ...ACTION_THEMES.share },
        ].map((a) => (
          <TouchableOpacity
            key={a.key}
            style={[styles.pAction, { backgroundColor: a.on ? a.color : a.bg, borderColor: a.on ? a.color : a.border }]}
            onPress={a.onPress}
            disabled={a.disabled}
            activeOpacity={0.85}
          >
            <View style={[styles.pActionIcon, { backgroundColor: a.on ? 'rgba(255,255,255,0.22)' : 'white' }]}>
              <Ionicons name={a.icon} size={17} color={a.on ? 'white' : a.color} />
            </View>
            <Text
              style={[styles.pActionText, { color: a.on ? 'white' : a.color }]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.7}
            >
              {a.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </>
  );

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
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {sections.map((section, index) => (
              <View key={`${section.title}-${index}`}>
                <View style={styles.modalSection}>
                  <View style={styles.modalIcon}>
                    <Ionicons name={section.icon} size={28} color={Colors.primary} />
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
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.modalBody}>
            {recipe.ingredients.map((item) => (
              <View key={item.id} style={styles.modalIngredientItem}>
                <View style={styles.modalIngredientInfo}>
                  {item.owned ? (
                    <Ionicons name="checkmark-circle" size={22} color={Colors.primary} />
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
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 16 }}
      >
        {renderHeroSection()}
        {/* Content sheet slides up over the photo, with rounded top corners. */}
        <View style={styles.pSheet}>
          {renderTitleSection()}
          {renderStatsBar()}
          {renderSafetySection()}
          {renderDetailsTabs()}
          {renderActiveDetailsSection()}
          {renderActionsSection()}
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
    backgroundColor: Colors.background,
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
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerIconButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroContainer: {
    height: 300,
    position: 'relative',
  },
  generateImageOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  generateImageOverlayButton: {
    minWidth: 160,
    alignItems: 'center',
  },
  generateImageButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  generateImageButtonDisabled: {
    opacity: 0.7,
  },
  generateImageButtonText: {
    color: Colors.text,
    fontWeight: '700',
    fontSize: 13,
  },
  recipeImage: {
    width: '100%',
    height: '100%',
  },
  emptyText: {
    fontSize: 14,
    color: Colors.textLight,
    paddingVertical: 8,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: Colors.surface,
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
    borderBottomColor: Colors.border,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.text,
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
    backgroundColor: `${Colors.primary}14`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalSectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 8,
  },
  modalSectionText: {
    fontSize: 15,
    color: Colors.textLight,
    lineHeight: 22,
  },
  modalDivider: {
    height: 1,
    backgroundColor: Colors.border,
    marginVertical: 20,
  },
  modalButton: {
    backgroundColor: Colors.primary,
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
    borderBottomColor: Colors.background,
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
    borderColor: Colors.accent,
  },
  modalIngredientText: {
    marginLeft: 12,
    flex: 1,
  },
  modalIngredientName: {
    fontSize: 16,
    color: Colors.text,
    marginBottom: 2,
  },
  modalIngredientAmount: {
    fontSize: 14,
    color: Colors.textLight,
  },
  ownershipBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 12,
  },
  ownedBadge: {
    backgroundColor: `${Colors.primary}14`,
  },
  neededBadge: {
    backgroundColor: `${Colors.accent}14`,
  },
  ownershipText: {
    fontSize: 12,
    fontWeight: '600',
  },
  ownedText: {
    color: Colors.primary,
  },
  neededText: {
    color: Colors.accent,
  },
  // ---- Premium layout ----
  heroShadeTop: { position: 'absolute', left: 0, right: 0, top: 0, height: 110 },
  heroShadeBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 90 },
  pSheet: {
    marginTop: -26,
    backgroundColor: Colors.background,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 22,
    paddingHorizontal: 16,
    gap: 14,
  },
  pTitleBlock: { paddingHorizontal: 4 },
  pTitle: { fontSize: 25, fontWeight: '900', color: Colors.brandNavy, lineHeight: 31 },
  pDescription: { fontSize: 14.5, color: Colors.textLight, lineHeight: 21, marginTop: 6 },
  pStatsRow: { flexDirection: 'row', gap: 8 },
  pStatPill: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 14 },
  pStatText: { fontSize: 13, fontWeight: '800', flexShrink: 1 },
  pSafetyShadow: {
    borderRadius: 20,
    shadowColor: '#2C8632',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pSafetyCard: { borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#CBE9CD' },
  pSafetyHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pSafetyIcon: { width: 40, height: 40, borderRadius: 13, backgroundColor: '#2C8632', alignItems: 'center', justifyContent: 'center' },
  pSafetyTitle: { fontSize: 16, fontWeight: '900', color: '#1F5E24' },
  pSafetySubtitle: { fontSize: 12, color: '#2C7A31', marginTop: 1 },
  pSafetyChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
  pSafetyChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'white', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  pSafetyChipText: { fontSize: 12, fontWeight: '800', color: '#1F5E24' },
  pTabs: { flexDirection: 'row', backgroundColor: '#E9EDE5', borderRadius: 14, padding: 4 },
  pTab: { flex: 1, height: 40, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pTabActive: {
    backgroundColor: 'white',
    shadowColor: '#0F2A3A',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  pTabText: { fontSize: 13.5, fontWeight: '800', color: Colors.textLight },
  pTabTextActive: { color: Colors.primary },
  pCard: {
    backgroundColor: 'white',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#EDF0EA',
    shadowColor: '#0F2A3A',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  pCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  pCardTitle: { fontSize: 17, fontWeight: '900', color: Colors.brandNavy },
  pCardMeta: { fontSize: 12.5, fontWeight: '700', color: Colors.textLight },
  pLink: { fontSize: 13, fontWeight: '900', color: Colors.primary },
  pHaveBox: { backgroundColor: '#F4FAF9', borderRadius: 14, padding: 12, marginBottom: 6 },
  pHaveText: { fontSize: 13, color: Colors.textLight, marginBottom: 8 },
  pHaveStrong: { fontWeight: '900', color: Colors.brandNavy },
  pProgressTrack: { height: 8, borderRadius: 4, backgroundColor: '#DCEBE9', overflow: 'hidden' },
  pProgressFill: { height: '100%', borderRadius: 4 },
  pIngRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: '#F0F2EC' },
  pIngCheck: { width: 24, height: 24, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  pIngOwned: { backgroundColor: Colors.primary },
  pIngNeeded: { backgroundColor: '#FFF1E6' },
  pIngName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: Colors.brandNavy },
  pIngAmount: { fontSize: 13, fontWeight: '800', color: Colors.primary, maxWidth: '40%', textAlign: 'right' },
  pStep: { flexDirection: 'row', gap: 12 },
  pStepRail: { alignItems: 'center' },
  pStepNum: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  pStepNumText: { color: 'white', fontWeight: '900', fontSize: 14 },
  pStepLine: { width: 2, flex: 1, backgroundColor: '#DCEBE9', marginVertical: 4 },
  pStepText: { flex: 1, fontSize: 15, lineHeight: 22, color: Colors.brandNavy, paddingBottom: 18, paddingTop: 4 },
  pTip: { borderRadius: 14, padding: 12, backgroundColor: '#FFF8EE', marginBottom: 8 },
  pTipOpen: { backgroundColor: '#FFF1DD' },
  pTipHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pTipIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: 'white', alignItems: 'center', justifyContent: 'center' },
  pTipTitle: { flex: 1, fontSize: 13.5, fontWeight: '800', color: '#7B4A0B' },
  pTipText: { fontSize: 14, color: '#5C3A0A', lineHeight: 20, marginTop: 8 },
  pCarbHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 16, padding: 16, marginBottom: 10 },
  pCarbLabel: { fontSize: 12.5, fontWeight: '800', color: 'rgba(255,255,255,0.85)', textTransform: 'uppercase', letterSpacing: 0.5 },
  pCarbValue: { fontSize: 30, fontWeight: '900', color: 'white', marginTop: 2 },
  pCarbIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  pNutriGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pNutriTile: { flexGrow: 1, flexBasis: '30%', borderRadius: 14, paddingVertical: 12, paddingHorizontal: 10, alignItems: 'center', gap: 3 },
  pNutriValue: { fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  pNutriLabel: { fontSize: 11.5, fontWeight: '800' },
  pAteShadow: {
    borderRadius: 16,
    shadowColor: '#2C8632',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  pAteButton: { height: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  pAteText: { color: 'white', fontSize: 16, fontWeight: '900' },
  pAteHint: { fontSize: 12, color: Colors.textLight, textAlign: 'center', marginTop: 8 },
  pDivider: { height: 1, backgroundColor: '#F0F2EC', marginVertical: 14 },
  pLoggedRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 6 },
  pLoggedText: { fontSize: 14.5, fontWeight: '800', color: Colors.brandNavy },
  pFeelTitle: { fontSize: 14.5, fontWeight: '900', color: Colors.brandNavy, textAlign: 'center', marginBottom: 10 },
  pFeelRow: { flexDirection: 'row', gap: 8 },
  pFeelOption: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 14, backgroundColor: '#F4F6F2', borderWidth: 1, borderColor: '#E6EAE2' },
  pFeelEmoji: { fontSize: 24 },
  pFeelLabel: { fontSize: 12.5, fontWeight: '800', color: Colors.brandNavy, marginTop: 4 },
  pActionsRow: { flexDirection: 'row', gap: 8 },
  pAction: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 16,
    borderWidth: 1.5,
  },
  pActionIcon: { width: 32, height: 32, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  pActionText: { fontSize: 12.5, fontWeight: '900' },
});

export default RecipeDetailsScreen;
