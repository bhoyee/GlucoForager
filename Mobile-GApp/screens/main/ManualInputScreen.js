import React, { useRef, useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useNavigation, useIsFocused, useRoute } from '@react-navigation/native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
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
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const footerHeight = 68;
  const contentBottomPadding = footerHeight + Math.max(insets.bottom, 12);
  const [ingredients, setIngredients] = useState(['']);
  const [isLoading, setIsLoading] = useState(false);
  const [longWait, setLongWait] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(null);
  const countdownDeadlineRef = useRef(null);
  const requestControllerRef = useRef(null);
  const pollingRef = useRef(null);
  const timeoutRef = useRef(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [scanStatus, setScanStatus] = useState({
    remaining: null,
    isPremium: false,
  });
  const lastPrefillTokenRef = useRef(null);
  const limitReached = !scanStatus.isPremium && scanStatus.remaining === 0;
  const allowedIngredientPattern = /^[A-Za-z0-9][A-Za-z0-9\s\-'/%%]*$/;

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
          setScanStatus({ remaining: null, isPremium: false });
          return;
        }
        const response = await apiFetch(
          `${API_URL}${API_ENDPOINTS.SCANS_TODAY}`,
          { headers: { Authorization: `Bearer ${token}` } },
          { onUnauthorized: signOut }
        );
        if (response.status === 401) {
          setScanStatus({ remaining: null, isPremium: false });
          return;
        }
      if (!response.ok) {
        setScanStatus({ remaining: null, isPremium: false });
        return;
      }
        const data = await response.json();
        setScanStatus({
          remaining: data?.searches_left ?? null,
          isPremium: Boolean(data?.is_premium),
        });
      } catch (error) {
        setScanStatus({ remaining: null, isPremium: false });
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

  const stopPolling = () => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setLongWait(false);
    setCountdownSeconds(null);
    countdownDeadlineRef.current = null;
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
      setCountdownSeconds(null);
      countdownDeadlineRef.current = null;
      return;
    }
    // Always show a 60s countdown for the loading modal (UX expectation for "Eat now" flows).
    const deadline = Date.now() + 60_000;
    countdownDeadlineRef.current = deadline;
    setCountdownSeconds(60);
    const id = setInterval(() => {
      const currentDeadline = countdownDeadlineRef.current;
      if (!currentDeadline) return;
      const remainingMs = currentDeadline - Date.now();
      const remaining = Math.max(0, Math.ceil(remainingMs / 1000));
      setCountdownSeconds(remaining);
    }, 250);
    return () => clearInterval(id);
  }, [isLoading]);

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
        if (response.status === 429) {
          setScanStatus((prev) => ({ ...prev, remaining: 0 }));
        }
        const detail = data?.detail;
        const message = detail?.message || detail || 'Unable to generate recipes.';
        Alert.alert('Request failed', message);
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

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'position' : undefined}
      keyboardVerticalOffset={headerPaddingTop}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: headerPaddingTop }]}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Type Ingredients</Text>
        <View style={styles.headerRight} />
      </View>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingBottom: contentBottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Ionicons name="information-circle-outline" size={24} color={Colors.primary} />
          <Text style={styles.instructionsText}>
            Enter the ingredients you have available. We'll find diabetes-safe recipes you can make.
          </Text>
        </View>
        {!scanStatus.isPremium && scanStatus.remaining !== null && (
          <View style={styles.scanBadge}>
            <Ionicons name="camera-outline" size={16} color={Colors.primary} />
            <Text style={styles.scanBadgeText}>
              {scanStatus.remaining} scans left today
            </Text>
          </View>
        )}
        {scanStatus.isPremium && (
          <View style={styles.scanBadge}>
            <Ionicons name="sparkles" size={16} color={Colors.primary} />
            <Text style={styles.scanBadgeText}>Unlimited scans</Text>
          </View>
        )}

        {/* Ingredients List */}
        <View style={styles.ingredientsContainer}>
          <Text style={styles.sectionTitle}>Your Ingredients</Text>
          
          {ingredients.map((ingredient, index) => (
            <View key={index} style={styles.ingredientRow}>
              <TextInput
                style={styles.ingredientInput}
                placeholder={`Ingredient ${index + 1} (e.g., tomato)`}
                placeholderTextColor={Colors.textMuted}
                value={ingredient}
                onChangeText={(text) => handleIngredientChange(text, index)}
                autoCapitalize="none"
                editable={!isLoading}
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
      <View
        style={[
          styles.footerBar,
          { paddingBottom: Math.max(insets.bottom, 8), height: footerHeight + Math.max(insets.bottom, 8) },
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
                  Limit reached for today
                </Text>
              </>
            ) : (
              <>
                <Ionicons name="search-outline" size={20} color="white" />
                <Text style={styles.findButtonText}>Find Diabetes-Safe Recipes</Text>
              </>
            )}
          </View>
        </TouchableOpacity>
      </View>
      <Modal transparent visible={isLoading} animationType="fade">
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.primary} />
            <Text style={styles.loadingTitle}>
              {isEatNow ? 'Generating meals...' : 'Generating recipes...'}
            </Text>
            <Text style={styles.loadingSubtitle}>
              {isEatNow
                ? 'Please wait while we prepare 3 diabetes-friendly meal options.'
                : 'Please wait while we prepare your diabetes-safe options.'}
            </Text>
            {typeof countdownSeconds === 'number' ? (
              <View style={styles.countdownBox}>
                <Text style={styles.countdownLabel}>
                  {countdownSeconds > 0 ? 'Time remaining' : 'Still working...'}
                </Text>
                {countdownSeconds > 0 ? (
                  <Text style={styles.countdownValue}>{countdownSeconds}s</Text>
                ) : null}
              </View>
            ) : null}
            {longWait ? (
              <View style={styles.longWaitBox}>
                <Text style={styles.longWaitTitle}>Taking longer than usual</Text>
                <Text style={styles.longWaitText}>
                  Still working in the background. You can keep waiting, or cancel and try again.
                </Text>
              </View>
            ) : null}
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={handleCancelRequest}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 0,
  },
  footerBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 2,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  loadingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 320,
  },
  loadingTitle: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
  },
  loadingSubtitle: {
    marginTop: 8,
    fontSize: 13,
    color: Colors.textLight,
    textAlign: 'center',
  },
  countdownBox: {
    marginTop: 12,
    alignItems: 'center',
  },
  countdownLabel: {
    fontSize: 13,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  countdownValue: {
    marginTop: 4,
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    textAlign: 'center',
  },
  longWaitBox: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F6F7FB',
    width: '100%',
  },
  longWaitTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  longWaitText: {
    fontSize: 13,
    color: Colors.textLight,
    lineHeight: 18,
    textAlign: 'center',
  },
  cancelButton: {
    marginTop: 16,
    backgroundColor: Colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 24,
    borderRadius: 20,
  },
  cancelButtonText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 14,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
  },
  headerRight: {
    width: 40,
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
    paddingVertical: 18,
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
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  findButtonTextLimit: {
    color: Colors.textLight,
  },
  loadingIcon: {
    marginRight: 8,
  },
});
