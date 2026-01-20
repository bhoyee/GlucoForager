import React, { useState, useEffect } from 'react';
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
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
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
  const isFocused = useIsFocused();
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const tabBarHeight = useBottomTabBarHeight();
  const headerPaddingTop = Math.max(insets.top, 16);
  const contentBottomPadding = Math.max(insets.bottom, 0);
  const [ingredients, setIngredients] = useState(['']);
  const [isLoading, setIsLoading] = useState(false);
  const [scanStatus, setScanStatus] = useState({
    remaining: null,
    isPremium: false,
  });
  const limitReached = !scanStatus.isPremium && scanStatus.remaining === 0;
  const allowedIngredientPattern = /^[A-Za-z0-9][A-Za-z0-9\s\-'/%%]*$/;

  const handleAddIngredient = () => {
    setIngredients([...ingredients, '']);
  };

  const handleRemoveIngredient = (index) => {
    if (ingredients.length > 1) {
      const newIngredients = [...ingredients];
      newIngredients.splice(index, 1);
      setIngredients(newIngredients);
    }
  };

  const handleIngredientChange = (text, index) => {
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

  const handleFindRecipes = async () => {
    const normalized = ingredients
      .map((ing) => ing.trim().replace(/\s+/g, ' '))
      .filter((ing) => ing !== '');

    if (normalized.length > 20) {
      Alert.alert('Too many ingredients', 'Please enter 20 ingredients or fewer.');
      return;
    }

    const invalid = normalized.find(
      (item) => item.length < 2 || item.length > 30 || !allowedIngredientPattern.test(item)
    );
    
    if (normalized.length === 0) {
      Alert.alert('Error', 'Please enter at least one ingredient');
      return;
    }

    if (invalid) {
      Alert.alert(
        'Invalid ingredient',
        "Use letters, numbers, spaces, hyphens, apostrophes, slashes, or % only."
      );
      return;
    }

    setIsLoading(true);
    
    try {
      const token = await AsyncStorage.getItem('userToken');
      if (!token) {
        Alert.alert('Sign in required', 'Please sign in to find recipes.');
        return;
      }
      const deviceId = await getDeviceId();
      const response = await apiFetch(
        `${API_URL}${API_ENDPOINTS.AI_TEXT_RECIPES}`,
        {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'X-Device-Id': deviceId,
        },
        body: JSON.stringify({ ingredients: normalized }),
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
        return;
      }

      if (!data?.results?.length) {
        Alert.alert('No recipes found', 'Try different ingredients and try again.');
        return;
      }

      navigation.navigate('RecipeResults', {
        recipes: data.results,
        selectedIngredients: normalized,
        source: 'text',
      });
    } catch (error) {
      Alert.alert('Request failed', 'Unable to reach the server. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
                placeholder={`Ingredient ${index + 1} (e.g., chicken, tomatoes)`}
                placeholderTextColor={Colors.textMuted}
                value={ingredient}
                onChangeText={(text) => handleIngredientChange(text, index)}
                autoCapitalize="none"
              />
              {ingredients.length > 1 && (
                <TouchableOpacity
                  style={styles.removeButton}
                  onPress={() => handleRemoveIngredient(index)}
                >
                  <Ionicons name="close-circle" size={24} color={Colors.error} />
                </TouchableOpacity>
              )}
            </View>
          ))}

          {/* Add More Button */}
          <TouchableOpacity
            style={styles.addButton}
            onPress={handleAddIngredient}
          >
            <Ionicons name="add-circle-outline" size={24} color={Colors.primary} />
            <Text style={styles.addButtonText}>Add Another Ingredient</Text>
          </TouchableOpacity>
        </View>

        {/* Examples */}
        <View style={styles.examplesContainer}>
          <Text style={styles.examplesTitle}>Examples:</Text>
          <View style={styles.examplesRow}>
            <TouchableOpacity
              style={styles.examplePill}
              onPress={() => setIngredients(['tomato', 'garlic'])}
            >
              <Text style={styles.exampleText}>Tomato</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Find Recipes Button */}
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
      </ScrollView>
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
  removeButton: {
    marginLeft: 12,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: Colors.border,
    borderStyle: 'dashed',
  },
  addButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: Colors.primary,
    fontWeight: '500',
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
    marginHorizontal: 20,
    borderRadius: 12,
    paddingVertical: 18,
    marginBottom: -8,
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
