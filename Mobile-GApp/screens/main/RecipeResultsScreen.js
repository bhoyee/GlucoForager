// screens/main/RecipeResultsScreen.js - ENHANCED VERSION
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';

const { width: screenWidth } = Dimensions.get('window');

export default function RecipeResultsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { photoUri } = route.params || {};
  
  const [isLoading, setIsLoading] = useState(true);
  const [detectedIngredients, setDetectedIngredients] = useState([]);
  const [recipes, setRecipes] = useState([]);

  // Mock AI detection data
  const mockIngredients = [
    { id: 1, name: 'Chicken Breast', category: 'Protein', confidence: '95%', icon: '🍗' },
    { id: 2, name: 'Broccoli', category: 'Vegetable', confidence: '88%', icon: '🥦' },
    { id: 3, name: 'Bell Peppers', category: 'Vegetable', confidence: '82%', icon: '🫑' },
    { id: 4, name: 'Carrots', category: 'Vegetable', confidence: '78%', icon: '🥕' },
    { id: 5, name: 'Eggs', category: 'Protein', confidence: '91%', icon: '🥚' },
    { id: 6, name: 'Spinach', category: 'Vegetable', confidence: '75%', icon: '🥬' },
    { id: 7, name: 'Tomatoes', category: 'Vegetable', confidence: '85%', icon: '🍅' },
    { id: 8, name: 'Onions', category: 'Vegetable', confidence: '80%', icon: '🧅' },
  ];

  const mockRecipes = [
    { 
      id: 1, 
      name: 'Mediterranean Chicken Stir Fry', 
      carbs: '18g', 
      time: '25 min', 
      match: '7/8 ingredients',
      difficulty: 'Easy',
      calories: '320',
      rating: 4.8,
      icon: '🥘'
    },
    { 
      id: 2, 
      name: 'Vegetable Omelette', 
      carbs: '12g', 
      time: '15 min', 
      match: '5/8 ingredients',
      difficulty: 'Easy',
      calories: '280',
      rating: 4.5,
      icon: '🍳'
    },
    { 
      id: 3, 
      name: 'Roasted Veggie Bowl', 
      carbs: '22g', 
      time: '35 min', 
      match: '6/8 ingredients',
      difficulty: 'Medium',
      calories: '310',
      rating: 4.7,
      icon: '🥗'
    },
    { 
      id: 4, 
      name: 'Chicken & Veggie Skewers', 
      carbs: '15g', 
      time: '30 min', 
      match: '6/8 ingredients',
      difficulty: 'Medium',
      calories: '290',
      rating: 4.6,
      icon: '🍢'
    },
  ];

  useEffect(() => {
    // Simulate AI processing
    setTimeout(() => {
      setDetectedIngredients(mockIngredients);
      setRecipes(mockRecipes);
      setIsLoading(false);
    }, 1500);
  }, []);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <LinearGradient
          colors={[Colors.primary, '#4CAF50']}
          style={styles.loadingGradient}
        >
          <Ionicons name="sparkles" size={60} color="white" />
          <Text style={styles.loadingTitle}>Analyzing Your Fridge</Text>
          <Text style={styles.loadingSubtitle}>Identifying ingredients and finding diabetes-safe recipes...</Text>
          <ActivityIndicator size="large" color="white" style={{ marginTop: 30 }} />
        </LinearGradient>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity 
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="arrow-back" size={24} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Scan Results</Text>
        <TouchableOpacity 
          style={styles.scanAgainButton}
          onPress={() => navigation.navigate('Scan')}
        >
          <Ionicons name="camera-outline" size={20} color={Colors.primary} />
          <Text style={styles.scanAgainText}>Scan Again</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Your Fridge Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📸 Your Fridge Scan</Text>
          {photoUri && (
            <View style={styles.imageContainer}>
              <Image source={{ uri: photoUri }} style={styles.image} resizeMode="cover" />
              <View style={styles.imageOverlay}>
                <Text style={styles.imageOverlayText}>8 ingredients detected</Text>
              </View>
            </View>
          )}
        </View>

        {/* Detected Ingredients */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🛒 Detected Ingredients</Text>
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
                  <Text style={styles.ingredientEmoji}>{item.icon}</Text>
                </View>
                <Text style={styles.ingredientName} numberOfLines={1}>{item.name}</Text>
                <View style={styles.confidenceBadge}>
                  <Text style={styles.confidenceText}>{item.confidence}</Text>
                </View>
                <Text style={styles.ingredientCategory}>{item.category}</Text>
              </View>
            ))}
          </ScrollView>
        </View>

        {/* Recipe Recommendations */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>🍽️ Diabetes-Safe Recipes</Text>
            <Text style={styles.recipeCount}>{recipes.length} recipes</Text>
          </View>
          <Text style={styles.sectionSubtitle}>Low glycemic recipes based on your ingredients</Text>
          
          {recipes.map((recipe) => (
            <TouchableOpacity 
              key={recipe.id}
              style={styles.recipeCard}
              onPress={() => navigation.navigate('RecipeDetail', { recipe })}
            >
              <LinearGradient
                colors={[Colors.primary + '20', Colors.primary + '10']}
                style={styles.recipeIcon}
              >
                <Text style={styles.recipeEmoji}>{recipe.icon}</Text>
              </LinearGradient>
              
              <View style={styles.recipeInfo}>
                <View style={styles.recipeHeader}>
                  <Text style={styles.recipeName} numberOfLines={2}>{recipe.name}</Text>
                  <View style={styles.rating}>
                    <Ionicons name="star" size={16} color="#FFD700" />
                    <Text style={styles.ratingText}>{recipe.rating}</Text>
                  </View>
                </View>
                
                <View style={styles.recipeMeta}>
                  <View style={styles.metaItem}>
                    <Ionicons name="time-outline" size={14} color={Colors.textLight} />
                    <Text style={styles.metaText}>{recipe.time}</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="flame-outline" size={14} color={Colors.textLight} />
                    <Text style={styles.metaText}>{recipe.calories} cal</Text>
                  </View>
                  <View style={styles.metaItem}>
                    <Ionicons name="nutrition-outline" size={14} color={Colors.textLight} />
                    <Text style={styles.metaText}>{recipe.carbs} carbs</Text>
                  </View>
                </View>
                
                <View style={styles.matchContainer}>
                  <LinearGradient
                    colors={[Colors.success, '#4CAF50']}
                    style={styles.matchBadge}
                  >
                    <Text style={styles.matchText}>{recipe.match}</Text>
                  </LinearGradient>
                  <Text style={styles.matchLabel}>ingredients match</Text>
                </View>
              </View>
              
              <Ionicons name="chevron-forward" size={24} color={Colors.textLight} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Action Buttons */}
        <View style={styles.actionButtons}>
          <TouchableOpacity 
            style={styles.primaryButton}
            onPress={() => navigation.navigate('ManualInput')}
          >
            <Ionicons name="add-circle-outline" size={22} color="white" />
            <Text style={styles.primaryButtonText}>Add Missing Ingredients</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.secondaryButton}
            onPress={() => navigation.navigate('Scan')}
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
    paddingTop: 60,
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
    paddingBottom: 40,
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
  },
  ingredientEmoji: {
    fontSize: 30,
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
  recipeIcon: {
    width: 60,
    height: 60,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  recipeEmoji: {
    fontSize: 30,
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
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    marginLeft: 4,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
  },
  recipeMeta: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metaText: {
    marginLeft: 4,
    fontSize: 13,
    color: Colors.textLight,
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