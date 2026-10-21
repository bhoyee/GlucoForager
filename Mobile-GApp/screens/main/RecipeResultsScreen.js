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
import { getCachedRecipeImageUrl, setCachedRecipeImageUrl, isPlaceholderRecipeImageUrl } from '../../utils/recipeImageCache';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { apiFetch } from '../../utils/api';
import { useAuth } from '../../context/authContext';
import { addDebugLog } from '../../utils/debugLogger';
import { isFreeLimitDetail, showFreeLimitAlert } from '../../utils/freeTier';

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
    filteredOut,
    warning,
    source,
  } = route.params || {};

  const [isLoading, setIsLoading] = useState(true);
  const [detectedIngredients, setDetectedIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);
  const [failedRecipeImages, setFailedRecipeImages] = useState({});
  const [generatingRecipeImages, setGeneratingRecipeImages] = useState({});
  const [imageLimitHit, setImageLimitHit] = useState(false);
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
            if (response.status === 429) setImageLimitHit(true);
            setFailedRecipeImages((prev) => ({ ...(prev || {}), [idx]: true }));
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
          setFailedRecipeImages((prev) => ({ ...(prev || {}), [idx]: true }));
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

      // All three at once: each image is one server call, so this halves the wait.
      const queue = [...candidates];
      const workers = new Array(Math.min(3, queue.length)).fill(0).map(async () => {
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
            // The user already confirmed these on the scan results screen, so skip the server's
            // ingredient review step (it has no UI here and would otherwise fail the request).
            body: JSON.stringify({ ingredients, ingredient_review_approved: true }),
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
            if (isFreeLimitDetail(detail)) {
              showFreeLimitAlert(detail, () =>
                navigation.navigate('Profile', { screen: 'ProfileMain', params: { openPremium: true } })
              );
            } else {
              Alert.alert(recipeFailureTitle(error), message, [
                { text: 'OK', onPress: () => navigation.goBack() },
              ]);
            }
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
        }, 1500);
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
          colors={['#062A27', '#0B5A46', '#1D7C7A']}
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

  const hasRecipes = recipes.length > 0;
  const hasDetectedIngredients = detectedIngredients.length > 0;
  const ignoredIngredients = Array.from(new Set([
    ...(Array.isArray(filteredOut) ? filteredOut : []),
    ...(Array.isArray(warning?.excluded) ? warning.excluded : []),
  ]
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)));
  const hasIgnoredIngredients = ignoredIngredients.length > 0;
  const selectedLower = (Array.isArray(selectedIngredients) ? selectedIngredients : [])
    .map((item) => String(item || '').toLowerCase().trim())
    .filter(Boolean);

  return (
    <View style={styles.container}>
      <ScrollView
        stickyHeaderIndices={[0]}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: contentBottomPadding + 24 }}
      >
        <View style={[styles.rHeader, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()} activeOpacity={0.85}>
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerCenter}>
              <Text style={styles.headerTitle}>Your recipes</Text>
              <Text style={styles.headerSubtitle}>
                {recipes.length
                  ? `${recipes.length} diabetes-friendly ideas${hasDetectedIngredients ? ` from ${detectedIngredients.length} ingredients` : ''}`
                  : 'Your generated meal ideas'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.headerActionButton}
              onPress={() => navigation.navigate('Scan', { screen: 'ScanMain' })}
              activeOpacity={0.85}
              accessibilityLabel="Scan again"
            >
              <Ionicons name="camera-outline" size={20} color="white" />
            </TouchableOpacity>
          </View>
          {hasDetectedIngredients ? (
            <View style={styles.rChipsBlock}>
              <Text style={styles.rChipsLabel}>{source === 'text' ? 'Your ingredients' : 'From your fridge'}</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rChips}>
                {detectedIngredients.map((item) => (
                  <View key={item.id} style={styles.rChip}>
                    <Ionicons name="leaf" size={11} color="#B9F6CA" />
                    <Text style={styles.rChipText}>{item.name}</Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          ) : null}
        </View>

        <View style={styles.rBody}>
          {hasIgnoredIngredients ? (
            <View style={styles.rNote}>
              <Ionicons name="shield-checkmark" size={18} color="#B7791F" />
              <View style={{ flex: 1 }}>
                <Text style={styles.rNoteTitle}>Left out for steadier blood sugar</Text>
                <Text style={styles.rNoteText}>{ignoredIngredients.join(', ')}</Text>
              </View>
            </View>
          ) : warning ? (
            <View style={styles.rNote}>
              <Ionicons name="alert-circle" size={18} color="#B7791F" />
              <Text style={[styles.rNoteText, { flex: 1 }]}>{warning?.message || String(warning)}</Text>
            </View>
          ) : null}

          {imageLimitHit ? (
            <View style={[styles.rNote, styles.rNoteInfo]}>
              <Ionicons name="images" size={17} color={Colors.primary} />
              <Text style={[styles.rNoteText, { flex: 1, color: Colors.primaryDark }]}>
                You&apos;ve used today&apos;s recipe photos. Your recipes work exactly the same, and photos are back tomorrow.
              </Text>
            </View>
          ) : null}

          {hasRecipes ? (
            recipes.map((recipe, index) => (
              <RecipeResultCard
                key={recipe.id || `${recipe?.title || 'recipe'}-${index}`}
                recipe={recipe}
                index={index}
                selectedLower={selectedLower}
                generating={Boolean(generatingRecipeImages?.[`${index}:${String(recipe?.title || recipe?.name || '').trim() || 'recipe'}`])}
                failed={Boolean(failedRecipeImages?.[index])}
                onImageError={() => setFailedRecipeImages((prev) => ({ ...(prev || {}), [index]: true }))}
                onPress={() => navigation.navigate('RecipeDetail', { recipe, selectedIngredients, source })}
              />
            ))
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="alert-circle-outline" size={32} color={Colors.textLight} />
              <Text style={styles.emptyTitle}>No recipes available</Text>
              <Text style={styles.emptyText}>Try different ingredients to generate recipes.</Text>
            </View>
          )}

          <View style={styles.rActions}>
            <TouchableOpacity
              style={styles.rActionShadow}
              onPress={() => navigation.navigate('Scan', { screen: 'ScanMain' })}
              activeOpacity={0.9}
            >
              <LinearGradient colors={['#23807E', '#0B5A46']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.rActionPrimary}>
                <Ionicons name="camera" size={19} color="white" />
                <Text style={styles.rActionPrimaryText}>Scan again</Text>
              </LinearGradient>
            </TouchableOpacity>
            <TouchableOpacity style={styles.rActionSecondary} onPress={() => navigation.navigate('ManualInput')} activeOpacity={0.85}>
              <Ionicons name="create-outline" size={19} color={Colors.primary} />
              <Text style={styles.rActionSecondaryText}>Type ingredients</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const IMPACT_BANDS = [
  { max: 30, label: 'Low carb', color: '#2C8632', bg: '#E9F6EA' },
  { max: 45, label: 'Moderate carb', color: '#B7791F', bg: '#FFF4DE' },
  { max: Infinity, label: 'Higher carb', color: '#C53030', bg: '#FDECEC' },
];

const numberFrom = (value) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const m = String(value ?? '').match(/\d+(?:\.\d+)?/);
  return m ? Number(m[0]) : null;
};

const minutesFor = (recipe) => {
  const total = numberFrom(recipe?.total_time ?? recipe?.time);
  if (total) return total;
  const sum = (numberFrom(recipe?.prep_time) || 0) + (numberFrom(recipe?.cook_time) || 0);
  return sum || null;
};

// Real photo, "plating" tile while it's made, or a clean branded tile - never a stock placeholder.
const RecipeResultCard = React.memo(function RecipeResultCard({ recipe, index, selectedLower, generating, failed, onImageError, onPress }) {
  const n = recipe?.nutritional_info || recipe?.nutrition || {};
  const carbs = numberFrom(n.carbs ?? n.carbs_g ?? recipe?.carbs);
  const protein = numberFrom(n.protein ?? recipe?.protein);
  const fiber = numberFrom(n.fiber ?? n.fibre ?? recipe?.fiber);
  const calories = numberFrom(n.calories ?? recipe?.calories);
  const minutes = minutesFor(recipe);
  const title = recipe?.title || recipe?.name || `Recipe ${index + 1}`;
  const band = carbs != null ? IMPACT_BANDS.find((b) => carbs <= b.max) : null;
  const url = typeof recipe?.image_url === 'string' ? recipe.image_url.trim() : '';
  const showPhoto = Boolean(url) && !isPlaceholderRecipeImageUrl(url) && !failed;

  const names = (Array.isArray(recipe?.ingredients) ? recipe.ingredients : [])
    .map((item) => String(typeof item === 'string' ? item : item?.name || '').toLowerCase())
    .filter(Boolean);
  const used = selectedLower.filter((s) => names.some((nm) => nm.includes(s) || s.includes(nm))).length;

  const stats = [
    minutes ? ['time-outline', `${minutes} min`] : null,
    carbs != null ? ['nutrition-outline', `${carbs}g carbs`] : null,
    protein != null ? ['barbell-outline', `${protein}g protein`] : null,
    fiber != null ? ['leaf-outline', `${fiber}g fibre`] : null,
    calories != null ? ['flame-outline', `${calories} kcal`] : null,
  ].filter(Boolean);

  return (
    <TouchableOpacity style={styles.rCard} onPress={onPress} activeOpacity={0.92}>
      <View style={styles.rPhotoWrap}>
        {showPhoto ? (
          <Image source={{ uri: url }} style={styles.rPhoto} resizeMode="cover" onError={onImageError} />
        ) : (
          <LinearGradient colors={['#E6F2EF', '#CFE6E1']} style={[styles.rPhoto, styles.rPhotoEmpty]}>
            <View style={styles.rPhotoIcon}>
              {generating ? <ActivityIndicator color={Colors.primary} /> : <Ionicons name="restaurant" size={26} color={Colors.primary} />}
            </View>
            {generating ? <Text style={styles.rPhotoEmptyText}>Plating your dish…</Text> : null}
          </LinearGradient>
        )}
        <LinearGradient colors={['transparent', 'rgba(6,30,26,0.82)']} style={styles.rPhotoShade} />
        <View style={styles.rPhotoTop}>
          {index === 0 ? (
            <View style={styles.rBest}>
              <Ionicons name="star" size={11} color="#7A4B00" />
              <Text style={styles.rBestText}>Best match</Text>
            </View>
          ) : <View />}
          {band ? (
            <View style={[styles.rBand, { backgroundColor: band.bg }]}>
              <Text style={[styles.rBandText, { color: band.color }]}>{band.label}</Text>
            </View>
          ) : null}
        </View>
        <View style={styles.rPhotoBottom}>
          <Text style={styles.rTitle} numberOfLines={2}>{title}</Text>
          {recipe?.difficulty ? <Text style={styles.rSubtitle}>{recipe.difficulty}{recipe?.servings ? ` · serves ${recipe.servings}` : ''}</Text> : null}
        </View>
      </View>

      <View style={styles.rInfo}>
        {stats.length ? (
          <View style={styles.rStats}>
            {stats.map(([icon, text]) => (
              <View key={text} style={styles.rStat}>
                <Ionicons name={icon} size={13} color={Colors.primary} />
                <Text style={styles.rStatText}>{text}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {selectedLower.length ? (
          <View style={styles.rMatch}>
            <View style={styles.rMatchTrack}>
              <View style={[styles.rMatchFill, { width: `${Math.max(6, Math.min(100, (used / selectedLower.length) * 100))}%` }]} />
            </View>
            <Text style={styles.rMatchText}>Uses {used} of your {selectedLower.length} ingredients</Text>
          </View>
        ) : null}
        <View style={styles.rOpen}>
          <Text style={styles.rOpenText}>View recipe</Text>
          <Ionicons name="arrow-forward" size={15} color={Colors.primary} />
        </View>
      </View>
    </TouchableOpacity>
  );
});

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
  safetyFilterBanner: {
    marginHorizontal: 20,
    marginTop: 4,
    marginBottom: 18,
    padding: 14,
    borderRadius: 18,
    backgroundColor: '#FFF3DF',
    borderWidth: 1,
    borderColor: '#F0B45D',
  },
  safetyFilterTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  safetyFilterIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#FFE0AD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  safetyFilterTitle: {
    flex: 1,
    color: '#5B3200',
    fontSize: 14,
    fontWeight: '800',
  },
  safetyFilterText: {
    color: '#6B4A1F',
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 12,
  },
  safetyFilterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  safetyFilterChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'white',
    borderWidth: 1,
    borderColor: '#F2C27D',
  },
  safetyFilterChipText: {
    color: '#8A4A00',
    fontSize: 12,
    fontWeight: '700',
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
    borderColor: 'rgba(53, 192, 189,0.12)',
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
  headerPanel: {
    backgroundColor: Colors.primaryDark,
    paddingHorizontal: 20,
    paddingBottom: 18,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
    marginBottom: 18,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '900',
    color: 'white',
  },
  headerSubtitle: {
    marginTop: 3,
    fontSize: 12,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.78)',
  },
  headerActionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollContent: {
    paddingTop: 0,
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
  // ---- Results (premium) ----
  rHeader: { backgroundColor: Colors.primaryDark, paddingHorizontal: 20, paddingBottom: 18, borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  rChipsBlock: { marginTop: 16 },
  rChipsLabel: { fontSize: 11.5, fontWeight: '800', color: 'rgba(255,255,255,0.75)', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  rChips: { gap: 6, paddingRight: 8 },
  rChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 999, paddingHorizontal: 11, paddingVertical: 6 },
  rChipText: { color: 'white', fontSize: 12.5, fontWeight: '800', textTransform: 'capitalize' },
  rBody: { padding: 16, gap: 16 },
  rNote: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: '#FFF7E8', borderColor: '#F6DFB0', borderWidth: 1, borderRadius: 16, padding: 12 },
  rNoteInfo: { backgroundColor: '#E8F4F3', borderColor: '#CDE7E4', alignItems: 'center' },
  rNoteTitle: { fontSize: 13.5, fontWeight: '900', color: '#7A4B00' },
  rNoteText: { fontSize: 12.5, lineHeight: 18, color: '#6B4A1F', marginTop: 2, textTransform: 'none' },
  rCard: {
    backgroundColor: 'white',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#EDF0EA',
    shadowColor: '#0F2A3A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  rPhotoWrap: { height: 200, backgroundColor: '#E6F2EF' },
  rPhoto: { width: '100%', height: '100%' },
  rPhotoEmpty: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  rPhotoIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center', marginTop: -30 },
  rPhotoEmptyText: { fontSize: 12.5, fontWeight: '800', color: Colors.primary },
  rPhotoShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 110 },
  rPhotoTop: { position: 'absolute', top: 12, left: 12, right: 12, flexDirection: 'row', justifyContent: 'space-between' },
  rBest: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#FFE7A8', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  rBestText: { fontSize: 11.5, fontWeight: '900', color: '#7A4B00' },
  rBand: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  rBandText: { fontSize: 11.5, fontWeight: '900' },
  rPhotoBottom: { position: 'absolute', left: 16, right: 16, bottom: 14 },
  rTitle: { fontSize: 20, lineHeight: 25, fontWeight: '900', color: 'white' },
  rSubtitle: { fontSize: 12.5, fontWeight: '700', color: 'rgba(255,255,255,0.85)', marginTop: 3 },
  rInfo: { padding: 14, gap: 12 },
  rStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  rStat: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#F2F7F6', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 6 },
  rStatText: { fontSize: 12, fontWeight: '800', color: Colors.brandNavy },
  rMatch: { gap: 6 },
  rMatchTrack: { height: 6, borderRadius: 3, backgroundColor: '#E5EEEC', overflow: 'hidden' },
  rMatchFill: { height: '100%', borderRadius: 3, backgroundColor: '#2C8632' },
  rMatchText: { fontSize: 12, fontWeight: '700', color: Colors.textLight },
  rOpen: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4 },
  rOpenText: { fontSize: 13.5, fontWeight: '900', color: Colors.primary },
  rActions: { gap: 10, marginTop: 4 },
  rActionShadow: { borderRadius: 16, shadowColor: '#0B5A46', shadowOpacity: 0.22, shadowRadius: 10, shadowOffset: { width: 0, height: 5 }, elevation: 3 },
  rActionPrimary: { height: 54, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  rActionPrimaryText: { color: 'white', fontSize: 16, fontWeight: '900' },
  rActionSecondary: { height: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#E8F4F3', borderWidth: 1.5, borderColor: '#CDE7E4' },
  rActionSecondaryText: { color: Colors.primary, fontSize: 15, fontWeight: '900' },
});
