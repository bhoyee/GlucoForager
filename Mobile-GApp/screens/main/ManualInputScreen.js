import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StatusBar,
  Platform,
  Keyboard,
  Alert,
  Modal,
  Animated,
  Easing,
} from 'react-native';
import { useNavigation, useIsFocused, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';

export default function ManualInputScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const headerPaddingTop = Math.max(insets.top, 16);
  const footerSafePadding = Math.max(insets.bottom, 6);
  // Keep enough room so the last input row isn't hidden behind the fixed footer.
  const contentBottomPadding = 140;
  const scrollRef = useRef(null);
  const ingredientsContainerYRef = useRef(0);
  const ingredientRowYRef = useRef({});
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const [activeIngredientIndex, setActiveIngredientIndex] = useState(null);
  const [ingredients, setIngredients] = useState(['']);
  const [isLoading, setIsLoading] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const requestControllerRef = useRef(null);
  const pollingRef = useRef(null);
  const timeoutRef = useRef(null);
  const phaseRef = useRef(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [statusLine, setStatusLine] = useState('');
  const [scanStatus, setScanStatus] = useState({
    remaining: null,
    isPremium: false,
    hasAccess: true,
    accessStatus: 'trial',
    trialDaysLeft: null,
  });
  const lastPrefillTokenRef = useRef(null);
  const loadingPulse = useRef(new Animated.Value(0)).current;
  const loadingRotate = useRef(new Animated.Value(0)).current;
  const loadingSweep = useRef(new Animated.Value(0)).current;
  const limitReached = scanStatus.hasAccess === false || scanStatus.accessStatus === 'expired';
  const allowedIngredientPattern = /^[A-Za-z0-9][A-Za-z0-9\s\-'/%%]*$/;
  const keyboardVisible = keyboardHeight > 0;
  const typingActive = activeIngredientIndex !== null || keyboardVisible;
  const keyboardScrollPadding = typingActive
    ? (keyboardVisible ? keyboardHeight : Platform.OS === 'ios' ? 320 : 360) + 180
    : contentBottomPadding;

  useEffect(() => {
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(loadingPulse, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(loadingPulse, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    const rotateAnimation = Animated.loop(
      Animated.timing(loadingRotate, {
        toValue: 1,
        duration: 2600,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    const sweepAnimation = Animated.loop(
      Animated.timing(loadingSweep, {
        toValue: 1,
        duration: 1800,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      })
    );
    pulseAnimation.start();
    rotateAnimation.start();
    sweepAnimation.start();
    return () => {
      pulseAnimation.stop();
      rotateAnimation.stop();
      sweepAnimation.stop();
    };
  }, [loadingPulse, loadingRotate, loadingSweep]);

  const handleAddIngredient = () => {
    if (isLoading) return;
    setIngredients([...ingredients, '']);
  };

  const handleRemoveIngredient = (index) => {
    if (isLoading) return;
    if (ingredients.length > 1) {
      const newIngredients = [...ingredients];
      newIngredients.splice(index, 1);
      setIngredients(newIngredients);
    }
  };

  const handleIngredientChange = (text, index) => {
    if (isLoading) return;
    const newIngredients = [...ingredients];
    newIngredients[index] = text;
    setIngredients(newIngredients);
  };

  const getDeviceId = async () => {
    const existing = await AsyncStorage.getItem('deviceId');
    if (existing) return existing;
    const generated = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem('deviceId', generated);
    return generated;
  };

  useEffect(() => {
    const fetchScanStatus = async () => {
      try {
        const token = await AsyncStorage.getItem('userToken');
        if (!token) {
          setScanStatus({ remaining: null, isPremium: false, hasAccess: false, accessStatus: 'expired', trialDaysLeft: 0 });
          return;
        }
        const response = await apiFetch(
          `${API_URL}${API_ENDPOINTS.SCANS_TODAY}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut }
        );
        if (response.status === 401) {
          setScanStatus({ remaining: null, isPremium: false, hasAccess: false, accessStatus: 'expired', trialDaysLeft: 0 });
          return;
        }
      if (!response.ok) {
        setScanStatus({ remaining: null, isPremium: false, hasAccess: false, accessStatus: 'expired', trialDaysLeft: 0 });
        return;
      }
        const data = await response.json();
        setScanStatus({
          remaining: data?.searches_left ?? null,
          isPremium: Boolean(data?.is_premium),
          hasAccess:
            data?.has_feature_access === true ||
            data?.is_premium === true ||
            ['premium', 'trial', 'grace'].includes(String(data?.access_status || '').toLowerCase()) ||
            data?.searches_left === 'unlimited',
          accessStatus: data?.access_status || (data?.is_premium ? 'premium' : 'trial'),
          trialDaysLeft: data?.trial_days_left ?? null,
        });
      } catch (error) {
        setScanStatus({ remaining: null, isPremium: false, hasAccess: true, accessStatus: 'trial', trialDaysLeft: null });
      }
    };

    if (isFocused) {
      fetchScanStatus();
    }
  }, [isFocused]);

  useEffect(() => {
    if (!isFocused) return;
    const prefill = route.params?.prefillIngredients;
    if (!Array.isArray(prefill) || prefill.length === 0) return;
    const cleaned = prefill
      .map((item) => `${item || ''}`.trim())
      .filter(Boolean)
      .slice(0, 20);
    if (!cleaned.length) return;

    const token = `${route.params?.source || 'prefill'}|${cleaned.join('|')}`;
    if (lastPrefillTokenRef.current === token) return;
    lastPrefillTokenRef.current = token;

    setIngredients(cleaned);
    if (route.params?.autoSubmit) {
      setTimeout(() => {
        handleFindRecipes(cleaned);
      }, 250);
    }
  }, [isFocused, route.params]);

  useEffect(() => {
    if (!isFocused) return;
    if (!route.params?.autoSubmit) return;
    const mode = route.params?.mode;
    if (mode !== 'surprise' && mode !== 'quick') return;

    const token = `mode|${mode}`;
    if (lastPrefillTokenRef.current === token) return;
    lastPrefillTokenRef.current = token;

    setTimeout(() => {
      handleFindRecipes([]);
    }, 250);
  }, [isFocused, route.params]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const scrollIngredientIntoView = (index, delay = 80) => {
    const rowY = ingredientRowYRef.current[index];
    const y = ingredientsContainerYRef.current + rowY;
    if (!Number.isFinite(y)) return;
    setTimeout(() => {
      scrollRef.current?.scrollTo?.({ y: Math.max(0, y - 48), animated: true });
    }, delay);
  };

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (event) => {
      const height = event?.endCoordinates?.height;
      setKeyboardHeight(Number.isFinite(height) ? height : 0);
      if (activeIngredientIndex !== null) {
        scrollIngredientIntoView(activeIngredientIndex, 100);
        scrollIngredientIntoView(activeIngredientIndex, 260);
      }
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
      setActiveIngredientIndex(null);
    });
    return () => {
      showSub?.remove?.();
      hideSub?.remove?.();
    };
  }, [activeIngredientIndex]);

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (phaseRef.current) {
      clearInterval(phaseRef.current);
      phaseRef.current = null;
    }
    setLongWait(false);
    setStatusLine('');
  };

  const scheduleLongWaitNotice = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLongWait(false);
    timeoutRef.current = setTimeout(() => setLongWait(true), 45000);
  };

  useEffect(() => {
    if (!isLoading) {
      if (phaseRef.current) clearInterval(phaseRef.current);
      phaseRef.current = null;
      setStatusLine('');
      return;
    }

    setStatusLine(isEatNow ? 'Preparing meal ideas...' : 'Starting recipe generation...');

    const phases = isEatNow
      ? [
          'Checking your preferences',
          'Balancing nutrition',
          'Creating meal ideas',
          'Finishing your options',
        ]
      : [
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

    return () => {
      if (phaseRef.current) clearInterval(phaseRef.current);
      phaseRef.current = null;
    };
  }, [isLoading, isEatNow]);

  const handleJobResult = (result, normalized) => {
    const recipes = result?.results || [];
    if (!recipes.length) {
      Alert.alert('No recipes found', 'Try different ingredients and try again.');
      return;
    }
    navigation.navigate('RecipeResults', {
      recipes,
      selectedIngredients: normalized,
      source: 'text',
      detectedIngredients: result?.detected || [],
      filteredOut: result?.filtered_out || [],
      warning: result?.warning || null,
    });
  };

  const pollJob = async (jobId, normalized) => {
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        setIsLoading(false);
        stopPolling();
        return;
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.AI_TEXT_RECIPES_ASYNC_STATUS}/${jobId}`,
        { headers: { Authorization: `Bearer ${token}` } },
        { onUnauthorized: signOut, timeoutMs: 10000 }
      );
      if (!response.ok) {
        return;
      }
      const data = await response.json();
      if (data.status === 'completed') {
        stopPolling();
        setIsLoading(false);
        setActiveJobId(null);
        handleJobResult(data.result, normalized);
      } else if (data.status === 'failed') {
        stopPolling();
        setIsLoading(false);
        setActiveJobId(null);
        Alert.alert('Request failed', data.error || 'Unable to generate recipes.');
      } else if (data.status === 'pending' || data.status === 'queued') {
        setStatusLine('Waiting to start...');
      } else if (data.status === 'running') {
        setStatusLine('Generating recipes...');
      }
    } catch (error) {
      // Ignore intermittent polling errors.
    }
  };

  const handleFindRecipes = async (overrideIngredients) => {
    if (isLoading) return;
    const mode = route.params?.mode;
    const sourceIngredients = Array.isArray(overrideIngredients) ? overrideIngredients : ingredients;
    const normalized = sourceIngredients
      .flatMap((ing) =>
        `${ing || ''}`
          .split(',')
          .map((part) =>
            part
              .trim()
              .replace(/^[,.;]+|[,.;]+$/g, '')
              .replace(/\s+/g, ' ')
          )
          .filter(Boolean)
      )
      .slice(0, 50);

    // De-dupe while keeping order (and enforce 20 max after splitting).
    const seen = new Set();
    const normalizedUnique = [];
    for (const item of normalized) {
      const key = item.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      normalizedUnique.push(item);
      if (normalizedUnique.length >= 20) break;
    }

    if (normalizedUnique.length > 20) {
      Alert.alert('Too many ingredients', 'Please enter 20 ingredients or fewer.');
      return;
    }

    if (normalizedUnique.length === 0) {
      const allowEmpty = mode === 'surprise' || mode === 'quick';
      if (!allowEmpty) {
        Alert.alert('Error', 'Please enter at least one ingredient');
        return;
      }
    } else {
      try {
        await AsyncStorage.setItem('last_used_ingredients_v1', JSON.stringify(normalizedUnique));
      } catch {
        // Ignore.
      }
    }

    if (normalizedUnique.length) {
      const invalid = normalizedUnique.find(
        (item) => item.length < 2 || item.length > 30 || !allowedIngredientPattern.test(item)
      );

      if (invalid) {
        Alert.alert(
          'Invalid ingredient',
          "Use letters, numbers, spaces, hyphens, apostrophes, slashes, or % only."
        );
        return;
      }
    }

    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsLoading(true);
    setLongWait(false);
     
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to find recipes.');
        setIsLoading(false);
        return;
      }
      const deviceId = await getDeviceId();
      const shouldExcludeRecent =
        Boolean(route.params?.excludeRecent) || route.params?.source === 'eat_now_have';
      const varietyMode =
        Boolean(route.params?.varietyMode) || route.params?.source === 'eat_now_have';

      let excludeTitles;
      if (shouldExcludeRecent) {
        try {
          const recentRes = await apiFetch(
            `${API_URL}${API_ENDPOINTS.RECENT_RECIPES}`,
            { headers: { Authorization: `Bearer ${token}` } },
            { onUnauthorized: signOut, timeoutMs: 10000 }
          );
          if (recentRes.ok) {
            const recentData = await recentRes.json();
            const items = Array.isArray(recentData?.items) ? recentData.items : [];
            const titles = items
              .map((item) => (item?.title || item?.name || '').toString().trim())
              .filter(Boolean);
            if (titles.length) {
              excludeTitles = titles.slice(0, 10);
            }
          }
        } catch {
          // Ignore recent fetch failures.
        }
      }
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.AI_TEXT_RECIPES_ASYNC}`,
        {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
        },
        body: JSON.stringify({
          ingredients: normalizedUnique,
          filters: Array.isArray(route.params?.filters) ? route.params.filters : undefined,
          mode: mode || undefined,
          exclude_titles: excludeTitles,
          variety_mode: varietyMode || undefined,
        }),
        signal: controller.signal,
        },
        { onUnauthorized: signOut, timeoutMs: 45000 }
      );
      if (response.status === 401) {
        return;
      }
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 402 || data?.detail?.code === 'trial_expired') {
          setScanStatus((prev) => ({ ...prev, hasAccess: false, accessStatus: 'expired', trialDaysLeft: 0 }));
        }
        const detail = data?.detail;
        const message = detail?.message || detail || 'Unable to generate recipes.';
        const title =
          detail?.code === 'trial_expired'
            ? 'Trial ended'
            : detail?.code === 'needs_clarification'
              ? 'Check ingredient'
              : 'Request failed';
        const buttons =
          detail?.code === 'trial_expired'
            ? [
                { text: 'Not now', style: 'cancel' },
                { text: 'Start Premium', onPress: () => navigation.navigate('Profile', { openPremium: true }) },
              ]
            : undefined;
        Alert.alert(title, message, buttons);
        setIsLoading(false);
        return;
      }
      if (!data?.job_id) {
        Alert.alert('Request failed', 'Unable to start recipe generation.');
        setIsLoading(false);
        return;
      }
      const jobId = data.job_id;
      setActiveJobId(jobId);
      await pollJob(jobId, normalizedUnique);
      pollingRef.current = setInterval(() => {
        pollJob(jobId, normalizedUnique);
      }, 3000);
      scheduleLongWaitNotice();
    } catch (error) {
      if (error?.name === 'AbortError') {
        setIsLoading(false);
        return;
      }
      Alert.alert('Request failed', 'Unable to reach the server. Please try again.');
      setIsLoading(false);
    } finally {
      requestControllerRef.current = null;
    }
  };

  const handleCancelRequest = () => {
    if (requestControllerRef.current) {
      requestControllerRef.current.abort();
    }
    stopPolling();
    setActiveJobId(null);
    setIsLoading(false);
  };

  const modeParam = route.params?.mode;
  const isEatNow = modeParam === 'surprise' || modeParam === 'quick';

  const ingredientCount = Array.isArray(ingredients)
    ? ingredients.map((x) => `${x || ''}`.trim()).filter(Boolean).length
    : 0;
  const loadingSteps = isEatNow
    ? ['Reviewing preferences', 'Balancing nutrition', 'Creating meals']
    : ['Reviewing ingredients', 'Balancing nutrition', 'Creating recipes'];
  const activeLoadingStep =
    statusLine?.includes('Balancing') || statusLine?.includes('diabetes')
      ? 1
      : statusLine?.includes('Building') ||
        statusLine?.includes('Creating') ||
        statusLine?.includes('Writing') ||
        statusLine?.includes('Finishing') ||
        statusLine?.includes('Generating')
        ? 2
        : 0;
  const loadingLogoScale = loadingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.08],
  });
  const loadingHaloScale = loadingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.2],
  });
  const loadingHaloOpacity = loadingPulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.22, 0.05],
  });
  const loadingRotateDeg = loadingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const loadingSweepTranslateX = loadingSweep.interpolate({
    inputRange: [0, 1],
    outputRange: [-76, 76],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={Colors.primaryDark} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: keyboardScrollPadding },
        ]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <View style={[styles.headerPanel, { paddingTop: headerPaddingTop }]}>
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.85}
            >
              <Ionicons name="arrow-back" size={22} color="white" />
            </TouchableOpacity>
            <View style={styles.headerText}>
              <Text style={styles.headerTitle}>Type Ingredients</Text>
              <Text style={styles.headerSubtitle}>Build recipes from what you have</Text>
            </View>
            <View style={styles.headerRight} />
          </View>
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Ionicons name="information-circle-outline" size={24} color={Colors.primary} />
          <Text style={styles.instructionsText}>
            Enter the ingredients you have available. We'll find diabetes-safe recipes you can make.
          </Text>
        </View>
        {scanStatus.accessStatus === 'trial' || scanStatus.accessStatus === 'grace' ? (
          <View style={styles.scanBadge}>
            <Ionicons name="time-outline" size={16} color={Colors.primary} />
            <Text style={styles.scanBadgeText}>
              {Number(scanStatus.trialDaysLeft) > 0
                ? `${scanStatus.trialDaysLeft} trial day${Number(scanStatus.trialDaysLeft) === 1 ? '' : 's'} left`
                : 'Trial active'}
            </Text>
          </View>
        ) : null}
        {scanStatus.isPremium && (
          <View style={styles.scanBadge}>
            <Ionicons name="infinite-outline" size={16} color={Colors.primary} />
            <Text style={styles.scanBadgeText}>Premium active</Text>
          </View>
        )}

        {/* Ingredients List */}
        <View
          style={styles.ingredientsContainer}
          onLayout={(event) => {
            ingredientsContainerYRef.current = event?.nativeEvent?.layout?.y ?? 0;
          }}
        >
          <Text style={styles.sectionTitle}>Your Ingredients</Text>
          
          {ingredients.map((ingredient, index) => (
            <View
              key={index}
              style={styles.ingredientRow}
              onLayout={(event) => {
                ingredientRowYRef.current[index] = event?.nativeEvent?.layout?.y ?? 0;
              }}
            >
              <TextInput
                style={styles.ingredientInput}
                placeholder={`Ingredient ${index + 1} (e.g., tomato)`}
                placeholderTextColor={Colors.textMuted}
                value={ingredient}
                onChangeText={(text) => handleIngredientChange(text, index)}
                autoCapitalize="none"
                editable={!isLoading}
                onFocus={() => {
                  setActiveIngredientIndex(index);
                  scrollIngredientIntoView(index, 100);
                  scrollIngredientIntoView(index, 280);
                }}
              />
              {index === ingredients.length - 1 && (
                <TouchableOpacity
                  style={styles.addInlineButton}
                  onPress={handleAddIngredient}
                  disabled={isLoading}
                >
                  <Ionicons name="add" size={18} color="white" />
                </TouchableOpacity>
              )}
              {ingredients.length > 1 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveIngredient(index)}
                  disabled={isLoading}
                >
                  <Ionicons name="close-circle" size={24} color={Colors.error} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          <Text style={styles.addHint}>Tap + to add another ingredient</Text>
        </View>

        {/* Examples */}
        <View style={styles.examplesContainer}>
        <Text style={styles.examplesTitle}>Examples:</Text>
        <View style={styles.examplesRow}>
          <TouchableOpacity
            style={styles.examplePill}
            disabled={isLoading}
            onPress={() => setIngredients(['tomato'])}
          >
            <Text style={styles.exampleText}>Tomato</Text>
          </TouchableOpacity>
        </View>
      </View>

      </ScrollView>
      {!typingActive ? (
        <View
          style={[
            styles.footerBar,
            {
              paddingBottom: footerSafePadding,
            },
          ]}
        >
          <TouchableOpacity
            style={[
              styles.findButton,
              (isLoading || limitReached) && styles.findButtonDisabled,
              limitReached && styles.findButtonLimit,
            ]}
            onPress={handleFindRecipes}
            disabled={isLoading || limitReached}
          >
            <View style={styles.findButtonContent}>
              {isLoading ? (
                <>
                  <Ionicons name="refresh" size={20} color="white" style={styles.loadingIcon} />
                  <Text style={styles.findButtonText}>Searching Recipes...</Text>
                </>
              ) : limitReached ? (
                <>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textLight} />
                  <Text style={[styles.findButtonText, styles.findButtonTextLimit]}>
                    Trial ended - start Premium
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="search-outline" size={20} color="white" />
                  <Text style={styles.findButtonText} numberOfLines={1} ellipsizeMode="tail">
                    Find Diabetes-Safe Recipes
                  </Text>
                </>
              )}
            </View>
          </TouchableOpacity>
        </View>
      ) : null}
      <Modal transparent visible={isLoading} animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingTopBadge}>
            <Ionicons name="restaurant-outline" size={14} color="#D9F8EC" />
            <Text style={styles.loadingTopBadgeText}>
              {isEatNow ? 'Meal ideas' : 'Recipe generation'}
            </Text>
          </View>
          <View style={styles.loadingCard}>
            <View style={styles.loadingLogoWrap}>
              <Animated.View
                style={[
                  styles.loadingLogoHalo,
                  {
                    opacity: loadingHaloOpacity,
                    transform: [{ scale: loadingHaloScale }],
                  },
                ]}
              />
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.loadingOrbit,
                  {
                    transform: [{ rotate: loadingRotateDeg }],
                  },
                ]}
              >
                <View style={styles.loadingOrbitDot} />
              </Animated.View>
              <Animated.View
                style={[
                  styles.loadingLogo,
                  {
                    transform: [{ scale: loadingLogoScale }],
                  },
                ]}
              >
                <Ionicons name="restaurant-outline" size={34} color="white" />
                <Animated.View
                  pointerEvents="none"
                  style={[
                    styles.loadingLogoSweep,
                    {
                      transform: [{ translateX: loadingSweepTranslateX }, { rotate: '18deg' }],
                    },
                  ]}
                />
              </Animated.View>
            </View>

            <Text style={styles.loadingTitle}>
              {isEatNow ? 'Preparing meal ideas' : 'Building your recipes'}
            </Text>
            <Text style={styles.loadingSubtitle}>
              {statusLine || (isEatNow ? 'Creating practical meal ideas from your preferences.' : 'Creating blood-sugar-friendly recipes from your ingredients.')}
            </Text>

            <View style={styles.loadingIngredientBadge}>
              <Ionicons name="leaf-outline" size={15} color={Colors.primary} />
              <Text style={styles.loadingIngredientText}>
                {ingredientCount ? `${ingredientCount} ingredient${ingredientCount !== 1 ? 's' : ''} selected` : 'Using your selection'}
              </Text>
            </View>

            <View style={styles.loadingSteps}>
              {loadingSteps.map((step, index) => {
                const complete = index < activeLoadingStep;
                const active = index === activeLoadingStep;
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
                              opacity: loadingHaloOpacity,
                              transform: [{ scale: loadingHaloScale }],
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

            {longWait ? (
              <View style={styles.longWaitBox}>
                <Text style={styles.longWaitTitle}>Taking longer than usual</Text>
                <Text style={styles.longWaitText}>
                  Still working in the background. You can keep waiting, or cancel and try again.
                </Text>
              </View>
            ) : null}

            <TouchableOpacity style={styles.cancelButton} onPress={handleCancelRequest}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingTop: 0,
    paddingBottom: 0,
  },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 29, 24, 0.90)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
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
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderRadius: 28,
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    width: '100%',
    maxWidth: 380,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 28,
    elevation: 10,
  },
  loadingLogoWrap: {
    width: 104,
    height: 104,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 18,
  },
  loadingLogoHalo: {
    position: 'absolute',
    width: 94,
    height: 94,
    borderRadius: 47,
    backgroundColor: Colors.primary,
  },
  loadingOrbit: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1,
    borderColor: 'rgba(29,158,117,0.20)',
  },
  loadingOrbitDot: {
    position: 'absolute',
    top: 6,
    alignSelf: 'center',
    width: 9,
    height: 9,
    borderRadius: 5,
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
    fontSize: 24,
    fontWeight: '800',
    color: Colors.text,
    textAlign: 'center',
  },
  loadingSubtitle: {
    marginTop: 10,
    fontSize: 15,
    color: Colors.textLight,
    textAlign: 'center',
    lineHeight: 22,
    minHeight: 44,
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
  longWaitBox: {
    marginTop: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    width: '100%',
  },
  longWaitTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 4,
    textAlign: 'center',
  },
  longWaitText: {
    fontSize: 12,
    color: '#92400E',
    lineHeight: 18,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 20,
    backgroundColor: '#F1F5F9',
    paddingVertical: 11,
    paddingHorizontal: 22,
    borderRadius: 999,
  },
  cancelButtonText: {
    color: Colors.textLight,
    fontWeight: '800',
    fontSize: 14,
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
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.16)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    flex: 1,
    marginLeft: 12,
  },
  headerTitle: {
    fontSize: 21,
    fontWeight: '900',
    color: 'white',
  },
  headerSubtitle: {
    marginTop: 2,
    fontSize: 13,
    color: 'rgba(255,255,255,0.78)',
    fontWeight: '600',
  },
  headerRight: {
    width: 44,
    height: 44,
  },
  instructionsContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: `${Colors.primary}10`,
    marginHorizontal: 20,
    marginBottom: 24,
    padding: 16,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: Colors.primary,
  },
  instructionsText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    color: Colors.text,
    lineHeight: 20,
  },
  scanBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: -8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  scanBadgeText: {
    marginLeft: 6,
    fontSize: 12,
    color: Colors.text,
    fontWeight: '600',
  },
  ingredientsContainer: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: Colors.text,
    marginBottom: 16,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  ingredientInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: Platform.OS === 'ios' ? 16 : 12,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addInlineButton: {
    marginLeft: 10,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeButton: {
    marginLeft: 12,
  },
  addHint: {
    marginTop: 6,
    fontSize: 13,
    color: Colors.textLight,
  },
  examplesContainer: {
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  examplesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  examplesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  examplePill: {
    backgroundColor: Colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignSelf: 'flex-start',
    maxWidth: '100%',
    minWidth: 84,
    flexShrink: 0,
  },
  exampleText: {
    fontSize: 14,
    color: Colors.primary,
    flexShrink: 0,
  },
  findButton: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 14,
    marginBottom: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  findButtonDisabled: {
    opacity: 0.7,
  },
  findButtonLimit: {
    backgroundColor: Colors.border,
  },
  findButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  findButtonText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    marginLeft: 8,
    flexShrink: 1,
    textAlign: 'center',
  },
  findButtonTextLimit: {
    color: Colors.textLight,
  },
  loadingIcon: {
    marginRight: 8,
  },
});
