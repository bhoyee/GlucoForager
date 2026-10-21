import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_ENDPOINTS, API_URL } from '../../config/api';
import { useAuth } from '../../context/authContext';
import { apiFetch } from '../../utils/api';
import { FREE_FEATURES, freeUsesLabel, getFreeUsage, isFreeLimitDetail, showFreeLimitAlert } from '../../utils/freeTier';

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
  const [ingredientReview, setIngredientReview] = useState(null);
  const [ingredientReviewChoices, setIngredientReviewChoices] = useState({});
  const [scanStatus, setScanStatus] = useState({
    remaining: null,
    isPremium: false,
    hasAccess: true,
    accessStatus: 'expired',
    trialDaysLeft: null,
    // Weekly free recipe generations for users without Premium (null = unlimited).
    freeUsage: null,
  });
  const lastPrefillTokenRef = useRef(null);
  const loadingPulse = useRef(new Animated.Value(0)).current;
  const loadingRotate = useRef(new Animated.Value(0)).current;
  const loadingSweep = useRef(new Animated.Value(0)).current;
  const limitReached = scanStatus.hasAccess === false;
  const allowedIngredientPattern = /^[A-Za-z0-9][A-Za-z0-9\s\-'/%%]*$/;
  const keyboardVisible = keyboardHeight > 0;
  const typingActive = activeIngredientIndex !== null || keyboardVisible;
  const keyboardScrollPadding = typingActive
    ? (keyboardVisible ? keyboardHeight : Platform.OS === 'ios' ? 320 : 360) + 180
    : contentBottomPadding;

  const openPremiumPaywall = useCallback(() => {
    const params = { screen: 'ProfileMain', params: { openPremium: true } };
    const parent = navigation.getParent?.();
    if (parent) {
      parent.navigate('Profile', params);
      return;
    }
    navigation.navigate('Profile', params);
  }, [navigation]);

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
        const fullAccess =
          data?.has_feature_access === true ||
          data?.is_premium === true ||
          ['premium', 'trialing', 'trial', 'cancelled_active', 'legacy_grace', 'grace'].includes(
            String(data?.access_status || '').toLowerCase()
          ) ||
          data?.searches_left === 'unlimited';
        const freeUsage = fullAccess ? null : getFreeUsage(data, FREE_FEATURES.RECIPE_GENERATION);
        setScanStatus({
          remaining: data?.searches_left ?? null,
          isPremium: Boolean(data?.is_premium),
          hasAccess: fullAccess || (freeUsage?.remaining || 0) > 0,
          accessStatus: data?.access_status || (data?.is_premium || data?.has_feature_access ? 'premium' : 'expired'),
          trialDaysLeft: data?.trial_days_left ?? null,
          freeUsage,
        });
      } catch (error) {
        setScanStatus({ remaining: null, isPremium: false, hasAccess: true, accessStatus: 'expired', trialDaysLeft: null });
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

  const handleJobResult = (result, normalized, reviewWarning = null) => {
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
      warning: result?.warning || reviewWarning || null,
    });
  };

  const pollJob = async (jobId, normalized, reviewWarning = null) => {
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
        handleJobResult(data.result, normalized, reviewWarning);
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

  const handleFindRecipes = async (overrideIngredients, options = {}) => {
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
          ingredient_review_approved: Boolean(options.reviewApproved),
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
        if (isFreeLimitDetail(detail)) {
          showFreeLimitAlert(detail, openPremiumPaywall);
          setIsLoading(false);
          return;
        }
        const message = detail?.message || detail || 'Unable to generate recipes.';
        const title =
          detail?.code === 'trial_expired'
            ? 'Upgrade to Premium'
            : detail?.code === 'needs_clarification'
              ? 'Check ingredient'
              : 'Request failed';
        const buttons =
          detail?.code === 'trial_expired'
            ? [
                { text: 'Not now', style: 'cancel' },
                { text: 'Upgrade', onPress: openPremiumPaywall },
              ]
            : undefined;
        Alert.alert(title, message, buttons);
        setIsLoading(false);
        return;
      }
      if (data?.status === 'review_required' && data?.review) {
        const defaults = {};
        (data.review?.items || []).forEach((item, index) => {
          if (item?.type === 'choice') {
            const options = Array.isArray(item.options) ? item.options.filter(Boolean) : [];
            defaults[index] = item.suggested || options[0] || '';
          }
        });
        setIngredientReviewChoices(defaults);
        setIngredientReview(data.review);
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
      const reviewWarning = options.reviewWarning || null;
      await pollJob(jobId, normalizedUnique, reviewWarning);
      pollingRef.current = setInterval(() => {
        pollJob(jobId, normalizedUnique, reviewWarning);
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


  const getReviewedIngredients = () => {
    const items = Array.isArray(ingredientReview?.items) ? ingredientReview.items : [];
    if (items.length) {
      return items
        .map((item, index) => {
          if (item?.type === 'choice') {
            return `${ingredientReviewChoices[index] || item.suggested || ''}`.trim();
          }
          return `${item?.suggested || item?.ingredient || item?.original || ''}`.trim();
        })
        .filter(Boolean);
    }
    return Array.isArray(ingredientReview?.final_ingredients)
      ? ingredientReview.final_ingredients.map((item) => `${item || ''}`.trim()).filter(Boolean)
      : [];
  };

  const handleApproveIngredientReview = () => {
    const finalIngredients = getReviewedIngredients();
    if (!finalIngredients.length) {
      setIngredientReview(null);
      setIngredientReviewChoices({});
      return;
    }
    const reviewWarning = {
      code: 'ingredient_adjustments_applied',
      message: 'Some ingredients were adjusted to better fit diabetes-friendly recipes.',
      excluded: [],
      changes: ingredientReview?.changes || [],
      source: 'ingredient_review',
    };
    setIngredientReview(null);
    setIngredientReviewChoices({});
    setIngredients(finalIngredients);
    setTimeout(() => {
      handleFindRecipes(finalIngredients, { reviewApproved: true, reviewWarning });
    }, 120);
  };

  const handleEditIngredientReview = () => {
    const finalIngredients = Array.isArray(ingredientReview?.final_ingredients)
      ? ingredientReview.final_ingredients.map((item) => `${item || ''}`.trim()).filter(Boolean)
      : [];
    setIngredientReview(null);
    setIngredientReviewChoices({});
    if (finalIngredients.length) {
      setIngredients(finalIngredients);
    }
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

  const filledCount = ingredients.filter((i) => i.trim()).length;

  // Quick add: tap to add (into the first empty box, else a new one); tap again to remove.
  const toggleQuickIngredient = (name) => {
    setIngredients((current) => {
      const idx = current.findIndex((i) => i.trim().toLowerCase() === name);
      if (idx !== -1) {
        const next = current.filter((_, i) => i !== idx);
        return next.length ? next : [''];
      }
      const empty = current.findIndex((i) => !i.trim());
      if (empty !== -1) return current.map((i, k) => (k === empty ? name : i));
      return [...current, name];
    });
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" />
      <ScrollView
        stickyHeaderIndices={[0]}
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

        <View style={styles.pBody}>
          {/* Intro */}
          <LinearGradient colors={['#E2F4F2', '#F4FBFA']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.pIntro}>
            <View style={styles.pIntroIcon}>
              <Ionicons name="basket" size={22} color="white" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.pIntroTitle}>What's in your kitchen?</Text>
              <Text style={styles.pIntroText}>Add what you have and we'll create blood-sugar-friendly recipes from it.</Text>
            </View>
          </LinearGradient>

          {/* Access status: welcome week days left, or this week's free uses. Premium needs no badge. */}
          {['trialing', 'trial', 'cancelled_active', 'legacy_grace', 'grace'].includes(scanStatus.accessStatus) ? (
            <View style={[styles.pStatus, styles.pStatusWelcome]}>
              <Ionicons name="gift" size={15} color="#0E7490" />
              <Text style={[styles.pStatusText, { color: '#0E7490' }]}>
                {Number(scanStatus.trialDaysLeft) > 0
                  ? `Welcome week · ${scanStatus.trialDaysLeft} day${Number(scanStatus.trialDaysLeft) === 1 ? '' : 's'} of full access left`
                  : scanStatus.accessStatus === 'cancelled_active'
                    ? 'Active until your period ends'
                    : scanStatus.accessStatus === 'legacy_grace' || scanStatus.accessStatus === 'grace'
                      ? 'Welcome week · full access'
                      : 'Trial active'}
              </Text>
            </View>
          ) : null}
          {scanStatus.freeUsage ? (
            <TouchableOpacity style={[styles.pStatus, styles.pStatusFree]} onPress={openPremiumPaywall} activeOpacity={0.8}>
              <Ionicons name="sparkles" size={15} color="#6B46C1" />
              <Text style={[styles.pStatusText, { color: '#5B3BA6' }]}>
                {freeUsesLabel(scanStatus.freeUsage, FREE_FEATURES.RECIPE_GENERATION)}
              </Text>
              <Ionicons name="chevron-forward" size={14} color="#6B46C1" />
            </TouchableOpacity>
          ) : null}

          {/* Ingredients */}
          <View
            style={styles.pCard}
            onLayout={(event) => {
              ingredientsContainerYRef.current = event?.nativeEvent?.layout?.y ?? 0;
            }}
          >
            <View style={styles.pCardHead}>
              <View style={[styles.pHeadIcon, { backgroundColor: '#2C8632' }]}>
                <Ionicons name="leaf" size={16} color="white" />
              </View>
              <Text style={styles.pCardTitle}>Your ingredients</Text>
              {filledCount ? (
                <View style={styles.pCount}>
                  <Text style={styles.pCountText}>{filledCount}</Text>
                </View>
              ) : null}
            </View>

            {ingredients.map((ingredient, index) => (
              <View
                key={index}
                style={[styles.pRow, activeIngredientIndex === index && styles.pRowActive]}
                onLayout={(event) => {
                  ingredientRowYRef.current[index] = event?.nativeEvent?.layout?.y ?? 0;
                }}
              >
                <View style={[styles.pRowNum, ingredient.trim() ? styles.pRowNumOn : null]}>
                  {ingredient.trim() ? (
                    <Ionicons name="checkmark" size={14} color="white" />
                  ) : (
                    <Text style={styles.pRowNumText}>{index + 1}</Text>
                  )}
                </View>
                <TextInput
                  style={styles.pInput}
                  placeholder={index === 0 ? 'e.g. chicken' : index === 1 ? 'e.g. spinach' : 'Add an ingredient'}
                  placeholderTextColor={Colors.textMuted}
                  value={ingredient}
                  onChangeText={(text) => handleIngredientChange(text, index)}
                  autoCapitalize="none"
                  editable={!isLoading}
                  returnKeyType="next"
                  onSubmitEditing={index === ingredients.length - 1 ? handleAddIngredient : undefined}
                  onFocus={() => {
                    setActiveIngredientIndex(index);
                    scrollIngredientIntoView(index, 100);
                    scrollIngredientIntoView(index, 280);
                  }}
                />
                {ingredients.length > 1 ? (
                  <TouchableOpacity
                    style={styles.pRemove}
                    onPress={() => handleRemoveIngredient(index)}
                    disabled={isLoading}
                    hitSlop={8}
                  >
                    <Ionicons name="close" size={16} color={Colors.textLight} />
                  </TouchableOpacity>
                ) : null}
              </View>
            ))}

            <TouchableOpacity style={styles.pAdd} onPress={handleAddIngredient} disabled={isLoading} activeOpacity={0.85}>
              <Ionicons name="add-circle" size={18} color={Colors.primary} />
              <Text style={styles.pAddText}>Add ingredient</Text>
            </TouchableOpacity>
          </View>

          {/* Quick add */}
          <View style={styles.pCard}>
            <View style={styles.pCardHead}>
              <View style={[styles.pHeadIcon, { backgroundColor: '#D97706' }]}>
                <Ionicons name="flash" size={16} color="white" />
              </View>
              <Text style={styles.pCardTitle}>Quick add</Text>
            </View>
            <View style={styles.pChips}>
              {QUICK_INGREDIENTS.map((item) => {
                const added = ingredients.some((i) => i.trim().toLowerCase() === item.name);
                return (
                  <TouchableOpacity
                    key={item.name}
                    style={[styles.pChip, { backgroundColor: added ? item.color : item.bg, borderColor: added ? item.color : item.border }]}
                    onPress={() => toggleQuickIngredient(item.name)}
                    disabled={isLoading}
                    activeOpacity={0.85}
                  >
                    <Ionicons name={added ? 'checkmark' : item.icon} size={14} color={added ? 'white' : item.color} />
                    <Text style={[styles.pChipText, { color: added ? 'white' : item.text }]}>{item.name}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.pTip}>
            <Ionicons name="bulb" size={15} color="#D97706" />
            <Text style={styles.pTipText}>Three or more ingredients give better recipes. Salt, oil and spices are assumed.</Text>
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
            style={[styles.pFindShadow, (isLoading || limitReached) && styles.findButtonDisabled]}
            onPress={handleFindRecipes}
            disabled={isLoading || limitReached}
            activeOpacity={0.9}
          >
            <LinearGradient
              colors={limitReached ? ['#E2E8F0', '#CBD5E1'] : ['#23807E', '#0B5A46']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.pFind}
            >
              {isLoading ? (
                <>
                  <Ionicons name="refresh" size={20} color="white" style={styles.loadingIcon} />
                  <Text style={styles.findButtonText}>Searching Recipes...</Text>
                </>
              ) : limitReached ? (
                <>
                  <Ionicons name="lock-closed-outline" size={20} color={Colors.textLight} />
                  <Text style={[styles.findButtonText, styles.findButtonTextLimit]}>
                    {scanStatus.freeUsage ? 'Free recipes used · more on Monday' : 'Upgrade to Premium'}
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="sparkles" size={20} color="white" />
                  <Text style={styles.findButtonText} numberOfLines={1} ellipsizeMode="tail">
                    {filledCount ? `Create recipes · ${filledCount} ingredient${filledCount === 1 ? '' : 's'}` : 'Create diabetes-friendly recipes'}
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </View>
      ) : null}

      <Modal transparent visible={Boolean(ingredientReview)} animationType="fade">
        <View style={styles.reviewOverlay}>
          <View style={styles.reviewCard}>
            <View style={styles.reviewIconWrap}>
              <Ionicons name="shield-checkmark-outline" size={28} color={Colors.warning} />
            </View>
            <Text style={styles.reviewTitle}>Review ingredient matches</Text>
            <Text style={styles.reviewText}>
              Choose or approve profile-safe matches before generating recipes.
            </Text>

            <ScrollView
              style={styles.reviewList}
              contentContainerStyle={styles.reviewListContent}
              nestedScrollEnabled
              showsVerticalScrollIndicator={(ingredientReview?.changes || []).length > 4}
            >
              {(ingredientReview?.changes || []).map((item, index) => (
                <View key={(item.original || 'item') + '-' + (item.suggested || index)} style={styles.reviewRow}>
                  <View style={styles.reviewRowHeader}>
                    <Text style={styles.reviewOriginal}>{item.original}</Text>
                    <Ionicons name="arrow-forward" size={15} color={Colors.textMuted} />
                    <Text style={styles.reviewSuggested}>{item.suggested}</Text>
                  </View>
                  {item?.type === 'choice' && Array.isArray(item.options) ? (
                    <View style={styles.reviewOptionRow}>
                      {item.options.map((option) => {
                        const choiceIndex = Number.isFinite(Number(item.review_index)) ? Number(item.review_index) : index;
                        const active = (ingredientReviewChoices[choiceIndex] || item.suggested) === option;
                        return (
                          <TouchableOpacity
                            key={option}
                            style={[styles.reviewOptionChip, active && styles.reviewOptionChipActive]}
                            onPress={() => setIngredientReviewChoices((prev) => ({ ...prev, [choiceIndex]: option }))}
                            activeOpacity={0.85}
                          >
                            <Text style={[styles.reviewOptionText, active && styles.reviewOptionTextActive]}>{option}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  ) : null}
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity style={styles.reviewPrimaryButton} onPress={handleApproveIngredientReview}>
              <Ionicons name="checkmark-circle-outline" size={19} color="white" />
              <Text style={styles.reviewPrimaryText}>Generate with suggestions</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.reviewSecondaryButton} onPress={handleEditIngredientReview}>
              <Text style={styles.reviewSecondaryText}>Edit ingredients first</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

const QUICK_INGREDIENTS = [
  { name: 'chicken', icon: 'restaurant', color: '#C2410C', bg: '#FFF1E6', border: '#F8D9BD', text: '#9A3412' },
  { name: 'eggs', icon: 'egg', color: '#B7791F', bg: '#FFF8E6', border: '#F6E2B0', text: '#7B4A0B' },
  { name: 'salmon', icon: 'fish', color: '#DD6B20', bg: '#FFEFE6', border: '#F9D3BC', text: '#9C4221' },
  { name: 'spinach', icon: 'leaf', color: '#2C8632', bg: '#E9F6EA', border: '#CBE9CD', text: '#1F5E24' },
  { name: 'broccoli', icon: 'leaf', color: '#2F855A', bg: '#E6F4EC', border: '#C6E6D3', text: '#22543D' },
  { name: 'tomato', icon: 'nutrition', color: '#C53030', bg: '#FDECEC', border: '#F6CFCF', text: '#9B2C2C' },
  { name: 'onion', icon: 'ellipse', color: '#805AD5', bg: '#F3EEFC', border: '#DFD3F7', text: '#553C9A' },
  { name: 'beans', icon: 'ellipse', color: '#975A16', bg: '#FAF1E4', border: '#EDDCC2', text: '#744210' },
  { name: 'lentils', icon: 'ellipse', color: '#B7791F', bg: '#FFF8E6', border: '#F6E2B0', text: '#7B4A0B' },
  { name: 'peppers', icon: 'flame', color: '#E53E3E', bg: '#FDECEC', border: '#F6CFCF', text: '#9B2C2C' },
  { name: 'greek yogurt', icon: 'ice-cream', color: '#2B6CB0', bg: '#E6F0FB', border: '#C8DCF4', text: '#2C5282' },
  { name: 'avocado', icon: 'leaf', color: '#38A169', bg: '#E9F6EA', border: '#CBE9CD', text: '#276749' },
];

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

  reviewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(7, 29, 24, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  reviewCard: {
    width: '100%',
    maxWidth: 390,
    maxHeight: '86%',
    backgroundColor: Colors.surface,
    borderRadius: 24,
    padding: 22,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowOffset: { width: 0, height: 18 },
    shadowRadius: 28,
    elevation: 10,
  },
  reviewIconWrap: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFF8E6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  reviewTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: Colors.text,
  },
  reviewText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 21,
    color: Colors.textLight,
  },
  reviewList: {
    marginTop: 16,
    maxHeight: 230,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#F2DCA2',
    backgroundColor: '#FFFBF0',
  },
  reviewListContent: {
    overflow: 'hidden',
  },
  reviewRow: {
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5E7BD',
    gap: 10,
  },
  reviewRowHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reviewOptionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingLeft: 2,
  },
  reviewOptionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E6D4A5',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  reviewOptionChipActive: {
    borderColor: Colors.primary,
    backgroundColor: '#E7F6EF',
  },
  reviewOptionText: {
    fontSize: 12,
    lineHeight: 16,
    color: Colors.textLight,
    fontWeight: '700',
  },
  reviewOptionTextActive: {
    color: Colors.primaryDark,
  },
  reviewOriginal: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.textLight,
    textDecorationLine: 'line-through',
  },
  reviewSuggested: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    lineHeight: 18,
    color: Colors.text,
    fontWeight: '800',
  },
  reviewPrimaryButton: {
    marginTop: 18,
    height: 50,
    borderRadius: 16,
    backgroundColor: Colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  reviewPrimaryText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '800',
  },
  reviewSecondaryButton: {
    marginTop: 10,
    height: 46,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  reviewSecondaryText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '800',
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
    borderColor: 'rgba(53,192,189,0.20)',
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
    borderColor: 'rgba(53,192,189,0.12)',
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
  findButtonDisabled: {
    opacity: 0.7,
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
  // ---- Premium layout ----
  pBody: { padding: 16, gap: 12 },
  pIntro: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: '#CDE7E4' },
  pIntroIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: Colors.primary, alignItems: 'center', justifyContent: 'center' },
  pIntroTitle: { fontSize: 17, fontWeight: '900', color: Colors.brandNavy },
  pIntroText: { fontSize: 13, lineHeight: 18, color: Colors.textLight, marginTop: 2 },
  pStatus: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  pStatusWelcome: { backgroundColor: '#E0F5F8' },
  pStatusFree: { backgroundColor: '#F0EBFB' },
  pStatusText: { fontSize: 12.5, fontWeight: '800' },
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
  pCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  pHeadIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  pCardTitle: { flex: 1, fontSize: 16, fontWeight: '900', color: Colors.brandNavy },
  pCount: { minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 8, backgroundColor: '#2C8632', alignItems: 'center', justifyContent: 'center' },
  pCountText: { color: 'white', fontSize: 12.5, fontWeight: '900' },
  pRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F7F8F5',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#EDF0EA',
    paddingLeft: 10,
    paddingRight: 8,
    marginBottom: 8,
  },
  pRowActive: { borderColor: Colors.primary, backgroundColor: 'white' },
  pRowNum: { width: 24, height: 24, borderRadius: 8, backgroundColor: '#E6EAE2', alignItems: 'center', justifyContent: 'center' },
  pRowNumOn: { backgroundColor: '#2C8632' },
  pRowNumText: { fontSize: 12, fontWeight: '900', color: Colors.textLight },
  pInput: { flex: 1, height: 48, fontSize: 15.5, fontWeight: '700', color: Colors.brandNavy },
  pRemove: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#EEF1EA', alignItems: 'center', justifyContent: 'center' },
  pAdd: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#9FD3CF',
    backgroundColor: '#F4FAF9',
    marginTop: 2,
  },
  pAddText: { fontSize: 14, fontWeight: '900', color: Colors.primary },
  pChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pChip: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  pChipText: { fontSize: 13, fontWeight: '800', textTransform: 'capitalize' },
  pTip: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 6 },
  pTipText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: Colors.textLight },
  pFindShadow: {
    borderRadius: 16,
    shadowColor: '#0B5A46',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  pFind: { height: 56, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
});
