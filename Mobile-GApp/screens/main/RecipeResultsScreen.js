// screens/main/RecipeResultsScreen.js
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { getCachedRecipeImageUrl, setCachedRecipeImageUrl } from '../../utils/recipeImageCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import { addDebugLog } from '../../utils/debugLogger';

export default function RecipeResultsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { signOut } = useAuth();
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
  const [failedRecipeImages, setFailedRecipeImages] = useState({});
  const [generatingRecipeImages, setGeneratingRecipeImages] = useState({});
  const pollingRef = useRef(null);
  const phaseRef = useRef(null);
  const [statusLine, setStatusLine] = useState('Starting recipe generation...');
  const errorShownRef = useRef(false);
  const lastJobStatusRef = useRef(null);
  const autoImageStartedRef = useRef(false);
  const imageInFlightRef = useRef(new Set());
  const loadingPulse = useRef(new Animated.Value(0)).current;
  const loadingSweep = useRef(new Animated.Value(0)).current;

  const recipeFailureTitle = (error) =>
    error?.type === 'invalid_input' ? 'Add a little more balance' : 'Recipe generation failed';

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulse, {
          toValue: 1,
          duration: 1150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(loadingPulse, {
          toValue: 0,
          duration: 1150,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const sweepAnimation = Animated.loop(
      Animated.timing(loadingSweep, {
        toValue: 1,
        duration: 2100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    pulseAnimation.start();
    sweepAnimation.start();
    return () => {
      pulseAnimation.stop();
      sweepAnimation.stop();
    };
  }, [loadingPulse, loadingSweep]);

  useEffect(() => {
    const ingredientSource = source === 'text' ? 'Input' : 'Detected';
    // Important: for scan flows (source='vision'), recipe generation must use the user's selected ingredients,
    // not every detected ingredient. `detectedFromParams` is used only for display.
    const normalizedSelected = Array.isArray(selectedIngredients)
      ? selectedIngredients.map((x) => (typeof x === 'string' ? x.trim() : '')).filter(Boolean)
      : [];
    const hasSelected = normalizedSelected.length > 0;
    const rawIngredients = source === 'vision' && hasSelected
      ? normalizedSelected
      : (Array.isArray(detectedFromParams) && detectedFromParams.length > 0)
        ? detectedFromParams
        : normalizedSelected;

    const normalizedIngredients = rawIngredients.map((item, index) => {
      const name = typeof item === 'string' ? item : item?.name || `Ingredient ${index + 1}`;
      return {
        id: `${index}-${name}`,
        name,
        confidence: ingredientSource,
      };
    });

    setDetectedIngredients(normalizedIngredients);
    const baseRecipes = recipesFromParams || [];

    const getDeviceId = async () => {
      const existing = await AsyncStorage.getItem('deviceId');
      if (existing) return existing;
      const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem('deviceId', generated);
      return generated;
    };

    const hydrateImages = async (incomingRecipes) => {
      const next = await Promise.all(
        (incomingRecipes || []).map(async (recipe) => {
          const directUrl =
            (typeof recipe?.image_url === 'string' && recipe.image_url.trim())
              ? recipe.image_url.trim()
              : (typeof recipe?.image === 'string' && recipe.image.trim())
                ? recipe.image.trim()
                : '';
          if (directUrl) {
            await setCachedRecipeImageUrl(recipe, directUrl);
            return { ...recipe, image_url: recipe.image_url || directUrl, image: recipe.image || directUrl };
          }
          const cached = await getCachedRecipeImageUrl(recipe);
          if (!cached) return recipe;
          return { ...recipe, image_url: cached, image: cached, image_source: 'ai' };
        })
      );
      setRecipes(next);
      setIsLoading(false);
    };

    const isPlaceholderUrl = (url) => {
      if (!url || typeof url !== 'string') return false;
      const u = url.toLowerCase();
      return u.includes('placeholder') || u.includes('/uploads/placeholders/') || u.includes('placeholders');
    };

    const extractIngredientNames = (recipe) => {
      const raw = recipe?.ingredients;
      if (!Array.isArray(raw)) return [];
      const names = [];
      for (const item of raw) {
        if (typeof item === 'string') {
          const n = item.trim();
          if (n) names.push(n);
          continue;
        }
        if (item && typeof item === 'object') {
          const n = String(item.name || item.title || '').trim();
          if (n) names.push(n);
        }
      }
      return names.slice(0, 24);
    };

    const autoGenerateMissingImages = async (incomingRecipes) => {
      // UX: show recipes immediately, then generate images in the background.
      // Avoid running twice for the same screen instance.
      if (autoImageStartedRef.current) return;
      autoImageStartedRef.current = true;

      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;

      const candidates = (incomingRecipes || [])
        .map((r, idx) => ({ recipe: r, idx }))
        .filter(({ recipe }) => {
          const src = String(recipe?.image_source || '').toLowerCase();
          const url = recipe?.image_url || recipe?.image || '';
          return !url || src === 'placeholder' || isPlaceholderUrl(url);
        })
        .slice(0, 3);

      if (!candidates.length) return;

      addDebugLog({
        source: 'AI',
        level: 'info',
        message: 'Auto image generation started',
        details: JSON.stringify({ count: candidates.length }),
      });

      const runOne = async ({ recipe, idx }) => {
        const title = String(recipe?.title || recipe?.name || '').trim();
        const key = `${idx}:${title || 'recipe'}`;
        if (imageInFlightRef.current.has(key)) return;
        imageInFlightRef.current.add(key);
        setGeneratingRecipeImages((prev) => ({ ...(prev || {}), [key]: true }));
        try {
          const response = await apiFetch(
            `${API_URL}${API_ENDPOINTS.AI_RECIPES_IMAGE}`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                title: title || 'Diabetes-friendly meal',
                description: String(recipe?.description || ''),
                ingredients: extractIngredientNames(recipe),
              }),
            },
            { onUnauthorized: signOut, timeoutMs: 25000 }
          );
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data?.image_url) {
            addDebugLog({
              source: 'AI',
              level: 'warn',
              message: 'Auto image generation failed',
              details: JSON.stringify({
                status: response.status,
                detail: data?.detail || null,
                title: title.slice(0, 60),
              }),
            });
            return;
          }

          const imageUrl = String(data.image_url || '').trim();
          if (!imageUrl) return;

          setRecipes((prev) => {
            const next = [...(prev || [])];
            const current = next[idx];
            if (!current) return prev;
            const updated = { ...current, image_url: imageUrl, image: imageUrl, image_source: 'ai' };
            next[idx] = updated;
            // Cache for future sessions.
            void setCachedRecipeImageUrl(updated, imageUrl);
            return next;
          });

          addDebugLog({
            source: 'AI',
            level: 'info',
            message: 'Auto image generation succeeded',
            details: JSON.stringify({ title: title.slice(0, 60) }),
          });
        } catch (error) {
          addDebugLog({
            source: 'AI',
            level: 'warn',
            message: 'Auto image generation network error',
            details: `${error?.message || error}`,
          });
        } finally {
          imageInFlightRef.current.delete(key);
          setGeneratingRecipeImages((prev) => {
            const next = { ...(prev || {}) };
            delete next[key];
            return next;
          });
        }
      };

      // Concurrency=2 to avoid spiking the network/device.
      const queue = [...candidates];
      const workers = new Array(Math.min(2, queue.length)).fill(0).map(async () => {
        while (queue.length) {
          const item = queue.shift();
          if (!item) return;
          // eslint-disable-next-line no-await-in-loop
          await runOne(item);
        }
      });
      await Promise.all(workers);
    };

    const pollJob = async (jobId) => {
      setStatusLine('Generating recipes...');
      const token = await AsyncStorage.getItem('userToken');
      if (!token) return;
      const res = await apiFetch(
        `${API_URL}${API_ENDPOINTS.AI_TEXT_RECIPES_ASYNC_STATUS}/${jobId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut, timeoutMs: 10000 }
      );
      if (!res.ok) return;
      const data = await res.json();
      if (data?.status && lastJobStatusRef.current !== data.status) {
        lastJobStatusRef.current = data.status;
        addDebugLog({
          source: 'AI',
          level: 'info',
          message: 'Text recipes job status',
          details: JSON.stringify({ job_id: jobId, status: data.status }),
        });
      }
      if (data.status === 'pending' || data.status === 'queued') {
        setStatusLine('Waiting to start...');
      }
      if (data.status === 'running') {
        setStatusLine('Generating recipes...');
      }
      if (data.status === 'completed') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        const result = data.result || {};
        const nextRecipes = Array.isArray(result?.results) ? result.results : (Array.isArray(result?.recipes) ? result.recipes : []);
        addDebugLog({
          source: 'AI',
          level: 'info',
          message: 'Text recipes job completed',
          details: JSON.stringify({ job_id: jobId, recipes_count: nextRecipes.length }),
        });
        await hydrateImages(nextRecipes);
        void autoGenerateMissingImages(nextRecipes);
      } else if (data.status === 'failed') {
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        setIsLoading(false);
        if (!errorShownRef.current) {
          errorShownRef.current = true;
          const result = data.result || {};
          const error = result?.error || {};
          const message =
            error?.message ||
            data.error ||
            'Unable to generate recipes right now. Please try again.';
          addDebugLog({
            source: 'AI',
            level: 'warn',
            message: 'Text recipes job failed',
            details: JSON.stringify({ job_id: jobId, message }),
          });
          Alert.alert(recipeFailureTitle(error), message, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      }
    };

    const generateIfMissing = async () => {
      if (baseRecipes.length > 0) {
        await hydrateImages(baseRecipes);
        void autoGenerateMissingImages(baseRecipes);
        return;
      }

      setStatusLine('Starting AI recipe generation...');

      const phases = [
        'Reviewing your ingredients',
        'Balancing carbs and protein',
        'Building recipe ideas',
        'Writing cooking steps',
        'Finishing your meal options',
      ];
      let idx = 0;
      if (phaseRef.current) clearInterval(phaseRef.current);
      phaseRef.current = setInterval(() => {
        idx = (idx + 1) % phases.length;
        setStatusLine(phases[idx]);
      }, 6500);

      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setIsLoading(false);
          return;
        }
        if (!normalizedSelected.length) {
          setIsLoading(false);
          Alert.alert('No ingredients selected', 'Please select at least one ingredient to generate recipes.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
          return;
        }
        const deviceId = await getDeviceId();
        const ingredients = normalizedSelected;
        addDebugLog({
          source: 'AI',
          level: 'info',
          message: 'Starting text recipe job',
          details: JSON.stringify({ ingredients_count: ingredients.length, ingredients_preview: ingredients.slice(0, 10) }),
        });
        const response = await apiFetch(
          `${API_URL}${API_ENDPOINTS.AI_TEXT_RECIPES_ASYNC}`,
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
              'X-Device-Id': deviceId,
            },
            body: JSON.stringify({ ingredients }),
          },
          { onUnauthorized: signOut, timeoutMs: 45000 }
        );
        if (response.status === 401) return;
        const data = await response.json();
        if (!response.ok || !data?.job_id) {
          setIsLoading(false);
          if (!errorShownRef.current) {
            errorShownRef.current = true;
            const detail = data?.detail;
            const error = typeof detail === 'object' && detail ? detail : {};
            const message =
              detail?.message ||
              (typeof detail === 'string' ? detail : null) ||
              data?.message ||
              'Unable to start recipe generation. Please try again.';
            addDebugLog({
              source: 'AI',
              level: 'warn',
              message: 'Text recipe job start failed',
              details: JSON.stringify({ status: response.status, message }),
            });
            Alert.alert(recipeFailureTitle(error), message, [
              { text: 'OK', onPress: () => navigation.goBack() },
            ]);
          }
          return;
        }
        addDebugLog({
          source: 'AI',
          level: 'info',
          message: 'Text recipe job started',
          details: JSON.stringify({ job_id: data.job_id }),
        });
        await pollJob(data.job_id);
        pollingRef.current = setInterval(() => {
          pollJob(data.job_id);
        }, 3000);
      } catch {
        setIsLoading(false);
        if (!errorShownRef.current) {
          errorShownRef.current = true;
          addDebugLog({
            source: 'AI',
            level: 'warn',
            message: 'Text recipe job start network error',
            details: 'apiFetch threw before receiving response',
          });
          Alert.alert('Recipe generation failed', 'Network error. Please try again.', [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        }
      }
    };

    generateIfMissing();
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      if (phaseRef.current) clearInterval(phaseRef.current);
      phaseRef.current = null;
    };
  }, [detectedFromParams, recipesFromParams, selectedIngredients, source, signOut]);

  if (isLoading) {
    const handleCancel = () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
      pollingRef.current = null;
      if (phaseRef.current) clearInterval(phaseRef.current);
      phaseRef.current = null;
      navigation.goBack();
    };

    const ingredientCount = Array.isArray(selectedIngredients) ? selectedIngredients.length : 0;
    const loadingSteps = [
      'Reviewing ingredients',
      'Balancing nutrition',
      'Creating recipes',
    ];
    const activeStep =
      statusLine?.includes('Balancing') || statusLine?.includes('diabetes')
        ? 1
        : statusLine?.includes('Building') ||
          statusLine?.includes('Writing') ||
          statusLine?.includes('Finishing') ||
          statusLine?.includes('Generating')
          ? 2
          : 0;
    const logoScale = loadingPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.98, 1.06],
    });
    const haloScale = loadingPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [1, 1.18],
    });
    const haloOpacity = loadingPulse.interpolate({
      inputRange: [0, 1],
      outputRange: [0.18, 0.04],
    });
    const sweepTranslateX = loadingSweep.interpolate({
      inputRange: [0, 1],
      outputRange: [-74, 74],
    });

    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={['#071D18', '#0F6E56', '#1D9E75']}
          style={styles.loadingGradient}
        >
          <View style={styles.loadingTopBadge}>
            <Ionicons name="restaurant-outline" size={14} color="#D9F8EC" />
            <Text style={styles.loadingTopBadgeText}>Recipe generation</Text>
          </View>
          <View style={styles.loadingCard}>
            <View style={styles.loadingLogoWrap}>
              <Animated.View
                style={[
                  styles.loadingLogoHalo,
                  {
                    opacity: haloOpacity,
                    transform: [{ scale: haloScale }],
                  },
                ]}
              />
              <Animated.View
                style={[
                  styles.loadingLogo,
                  {
                    transform: [{ scale: logoScale }],
                  },
                ]}
              >
                <Ionicons name="restaurant-outline" size={36} color="white" />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.loadingLogoSweep,
                    {
                      transform: [{ translateX: sweepTranslateX }, { rotate: '18deg' }],
                    },
                  ]}
                />
              </Animated.View>
            </View>

            <Text style={styles.loadingTitle}>Building your recipes</Text>
            <Text style={styles.loadingSubtitle}>
              {statusLine || 'Creating blood-sugar-friendly meal ideas from your ingredients.'}
            </Text>

            <View style={styles.loadingIngredientBadge}>
              <Ionicons name="leaf-outline" size={15} color={Colors.primary} />
              <Text style={styles.loadingIngredientText}>
                {ingredientCount > 0 ? `${ingredientCount} ingredient${ingredientCount !== 1 ? 's' : ''} selected` : 'Using your selected ingredients'}
              </Text>
            </View>

            <View style={styles.loadingSteps}>
              {loadingSteps.map((step, index) => {
                const complete = index < activeStep;
                const active = index === activeStep;
                return (
                  <View key={step} style={styles.loadingStepRow}>
                    <View style={[
                      styles.loadingStepIcon,
                      complete && styles.loadingStepIconComplete,
                      active && styles.loadingStepIconActive,
                    ]}>
                      {complete ? (
                        <Ionicons name="checkmark" size={14} color="white" />
                      ) : active ? (
                        <Animated.View
                          style={[
                            styles.loadingActivePulse,
                            {
                              opacity: haloOpacity,
                              transform: [{ scale: haloScale }],
                            },
                          ]}
                        />
                      ) : (
                        <View style={styles.loadingStepDot} />
                      )}
                    </View>
                    <Text style={[
                      styles.loadingStepText,
                      active && styles.loadingStepTextActive,
                    ]}>
                      {step}
                    </Text>
                  </View>
                );
              })}
            </View>

            <Text style={styles.loadingHint}>
              This can take a moment while GlucoForager prepares practical options for your kitchen.
            </Text>

            <TouchableOpacity style={styles.loadingCancelButton} onPress={handleCancel}>
              <Text style={styles.loadingCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
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
      return `${total} mins`;
    }
    const prep = recipe?.prep_time ?? 0;
    const cook = recipe?.cook_time ?? 0;
    const sum = prep + cook;
    if (sum > 0) {
      return `${sum} mins`;
    }
    return 'N/A';
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
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
      >
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
            const recipeImageUrl =
              typeof recipe?.image_url === 'string' && recipe.image_url.trim()
                ? recipe.image_url.trim()
                : null;
            const imageFailed = Boolean(failedRecipeImages?.[imageKey]);
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
                <View style={styles.recipeThumbWrap}>
                  {recipeImageUrl && !imageFailed ? (
                    <Image
                      source={{ uri: recipeImageUrl }}
                      style={styles.recipeThumb}
                      resizeMode="cover"
                      onError={() =>
                        setFailedRecipeImages((prev) => ({
                          ...(prev || {}),
                          [imageKey]: true,
                        }))
                      }
                    />
                  ) : (
                    <View style={styles.recipeThumbPlaceholder}>
                      <ActivityIndicator size="small" color={Colors.textMuted} />
                      <Text style={styles.recipeThumbPlaceholderText}>Generating image...</Text>
                    </View>
                  )}
                </View>
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
                      colors={[Colors.success, Colors.primaryLight]}
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
    paddingHorizontal: 24,
    paddingVertical: 40,
  },
  loadingTopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    marginBottom: 18,
  },
  loadingTopBadgeText: {
    color: '#D9F8EC',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  loadingCard: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.97)',
    borderRadius: 28,
    paddingHorizontal: 24,
    paddingVertical: 30,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 28,
    elevation: 10,
  },
  loadingLogoWrap: {
    width: 92,
    height: 92,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  loadingLogoHalo: {
    position: 'absolute',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: Colors.primary,
  },
  loadingLogo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    overflow: 'hidden',
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.28)',
    shadowColor: Colors.primary,
    shadowOpacity: 0.38,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  loadingLogoSweep: {
    position: 'absolute',
    width: 28,
    height: 88,
    backgroundColor: 'rgba(255,255,255,0.22)',
  },
  loadingTitle: {
    fontSize: 25,
    fontWeight: '800',
    color: Colors.text,
    marginBottom: 10,
    textAlign: 'center',
  },
  loadingSubtitle: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 23,
    minHeight: 46,
  },
  loadingIngredientBadge: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F0FFF8',
    borderWidth: 1,
    borderColor: 'rgba(11,90,70,0.12)',
  },
  loadingIngredientText: {
    marginLeft: 7,
    color: Colors.primary,
    fontSize: 13,
    fontWeight: '700',
  },
  loadingSteps: {
    width: '100%',
    marginTop: 24,
    backgroundColor: '#F6FBF8',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(29,158,117,0.12)',
  },
  loadingStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  loadingStepIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  loadingStepIconComplete: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  loadingStepIconActive: {
    borderColor: Colors.primary,
    backgroundColor: '#F0FFF8',
  },
  loadingActivePulse: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: Colors.primary,
  },
  loadingStepDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: Colors.textMuted,
  },
  loadingStepText: {
    flex: 1,
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: '700',
  },
  loadingStepTextActive: {
    color: Colors.text,
  },
  loadingHint: {
    marginTop: 18,
    color: Colors.textLight,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  loadingCancelButton: {
    marginTop: 20,
    paddingHorizontal: 22,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  loadingCancelText: {
    color: Colors.textLight,
    fontSize: 14,
    fontWeight: '800',
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
    borderRadius: 18,
    padding: 14,
    marginHorizontal: 20,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  recipeThumbWrap: {
    width: 112,
    height: 84,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F2F4F7',
    marginRight: 14,
  },
  recipeThumb: {
    width: '100%',
    height: '100%',
  },
  recipeThumbPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F2F4F7',
    gap: 6,
  },
  recipeThumbPlaceholderText: {
    fontSize: 11,
    color: Colors.textMuted,
    textAlign: 'center',
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
