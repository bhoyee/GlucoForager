// screens/main/FavoritesScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Alert,
  RefreshControl,
} from 'react-native';
import { useNavigation, useIsFocused } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

// Mock favorite recipes data
const MOCK_FAVORITES = [
  {
    id: '1',
    name: 'Low-Carb Chicken Salad',
    description: 'High protein, low carb chicken salad with fresh vegetables',
    image: 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c',
    rating: 4.8,
    prepTime: '15 min',
    calories: 320,
    isGlutenFree: true,
    isVegan: false,
    lastViewed: '2 hours ago',
  },
  {
    id: '2',
    name: 'Quinoa Buddha Bowl',
    description: 'Nutrient-packed bowl with quinoa, avocado, and roasted veggies',
    image: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd',
    rating: 4.6,
    prepTime: '20 min',
    calories: 450,
    isGlutenFree: true,
    isVegan: true,
    lastViewed: '1 day ago',
  },
  {
    id: '3',
    name: 'Salmon with Asparagus',
    description: 'Omega-3 rich salmon with lemon butter asparagus',
    image: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288',
    rating: 4.9,
    prepTime: '25 min',
    calories: 380,
    isGlutenFree: true,
    isVegan: false,
    lastViewed: '3 days ago',
  },
  {
    id: '4',
    name: 'Berry Protein Smoothie',
    description: 'Antioxidant-rich smoothie with whey protein',
    image: 'https://images.unsplash.com/photo-1506905925346-21bda4d32df4',
    rating: 4.5,
    prepTime: '5 min',
    calories: 280,
    isGlutenFree: true,
    isVegan: false,
    lastViewed: '1 week ago',
  },
  {
    id: '5',
    name: 'Zucchini Noodles with Pesto',
    description: 'Low-carb zucchini noodles with fresh basil pesto',
    image: 'https://images.unsplash.com/photo-1546833999-b9f581a1996d',
    rating: 4.7,
    prepTime: '18 min',
    calories: 290,
    isGlutenFree: true,
    isVegan: true,
    lastViewed: '2 weeks ago',
  },
];

export default function FavoritesScreen() {
  const navigation = useNavigation();
  const isFocused = useIsFocused();
  
  const [favorites, setFavorites] = useState(MOCK_FAVORITES);
  const [showMockData, setShowMockData] = useState(true); // Toggle for demo
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('recent'); // recent, rating, calories

  // Simulate loading real data (empty array for production)
  const realUserFavorites = [];

  const onRefresh = () => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => {
      setRefreshing(false);
      Alert.alert('Refreshed', 'Your favorites have been updated.');
    }, 1500);
  };

  const removeFromFavorites = (id) => {
    Alert.alert(
      'Remove Favorite',
      'Are you sure you want to remove this recipe from favorites?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            const updatedFavorites = favorites.filter(item => item.id !== id);
            setFavorites(updatedFavorites);
            if (updatedFavorites.length === 0) {
              setShowMockData(false);
            }
          },
        },
      ]
    );
  };

  const clearAllFavorites = () => {
    if (favorites.length === 0) return;
    
    Alert.alert(
      'Clear All Favorites',
      'Are you sure you want to remove all recipes from favorites?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear All',
          style: 'destructive',
          onPress: () => {
            setFavorites([]);
            setShowMockData(false);
          },
        },
      ]
    );
  };

  const sortFavorites = (type) => {
    setSortBy(type);
    let sorted = [...favorites];
    
    switch (type) {
      case 'recent':
        // Already sorted by recent in mock data
        break;
      case 'rating':
        sorted.sort((a, b) => b.rating - a.rating);
        break;
      case 'calories':
        sorted.sort((a, b) => a.calories - b.calories);
        break;
    }
    
    setFavorites(sorted);
  };

  const navigateToRecipe = (recipe) => {
    navigation.navigate('RecipeDetail', { recipe });
  };

  // Show empty state if no favorites
  if (!showMockData || favorites.length === 0) {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Favorites</Text>
          <TouchableOpacity 
            style={styles.mockToggle}
            onPress={() => setShowMockData(!showMockData)}
          >
            <Ionicons 
              name={showMockData ? "eye-off-outline" : "eye-outline"} 
              size={24} 
              color={Colors.primary} 
            />
            <Text style={styles.mockToggleText}>
              {showMockData ? "Hide Mock" : "Show Mock"}
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={100} color={Colors.textLight} />
          <Text style={styles.emptyTitle}>No Favorites Yet</Text>
          <Text style={styles.emptySubtitle}>
            {showMockData 
              ? 'Mock data is hidden. Toggle to show sample favorites.'
              : 'Save recipes you love to see them here'
            }
          </Text>
          
          <TouchableOpacity 
            style={styles.button}
            onPress={() => navigation.navigate('Home')}
          >
            <Ionicons name="restaurant-outline" size={20} color="white" />
            <Text style={styles.buttonText}>Browse Recipes</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.button, styles.secondaryButton]}
            onPress={() => setShowMockData(true)}
          >
            <Ionicons name="color-wand-outline" size={20} color={Colors.primary} />
            <Text style={styles.secondaryButtonText}>Show Sample Favorites</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show favorites list
  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>My Favorites</Text>
          <Text style={styles.headerSubtitle}>{favorites.length} saved recipes</Text>
        </View>
        
        <TouchableOpacity 
          style={styles.mockToggle}
          onPress={() => setShowMockData(!showMockData)}
        >
          <Ionicons 
            name={showMockData ? "eye-off-outline" : "eye-outline"} 
            size={24} 
            color={Colors.primary} 
          />
          <Text style={styles.mockToggleText}>
            {showMockData ? "Hide Mock" : "Show Mock"}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Sort Options */}
      <View style={styles.sortContainer}>
        <Text style={styles.sortLabel}>Sort by:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sortButtons}>
          <TouchableOpacity 
            style={[styles.sortButton, sortBy === 'recent' && styles.sortButtonActive]}
            onPress={() => sortFavorites('recent')}
          >
            <Ionicons name="time-outline" size={16} color={sortBy === 'recent' ? 'white' : Colors.text} />
            <Text style={[styles.sortButtonText, sortBy === 'recent' && styles.sortButtonTextActive]}>
              Recent
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.sortButton, sortBy === 'rating' && styles.sortButtonActive]}
            onPress={() => sortFavorites('rating')}
          >
            <Ionicons name="star-outline" size={16} color={sortBy === 'rating' ? 'white' : Colors.text} />
            <Text style={[styles.sortButtonText, sortBy === 'rating' && styles.sortButtonTextActive]}>
              Rating
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.sortButton, sortBy === 'calories' && styles.sortButtonActive]}
            onPress={() => sortFavorites('calories')}
          >
            <Ionicons name="flame-outline" size={16} color={sortBy === 'calories' ? 'white' : Colors.text} />
            <Text style={[styles.sortButtonText, sortBy === 'calories' && styles.sortButtonTextActive]}>
              Calories
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.sortButton, styles.clearButton]}
            onPress={clearAllFavorites}
          >
            <Ionicons name="trash-outline" size={16} color={Colors.danger} />
            <Text style={[styles.sortButtonText, { color: Colors.danger }]}>
              Clear All
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* Favorites List */}
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[Colors.primary]}
          />
        }
      >
        {favorites.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={styles.favoriteCard}
            onPress={() => navigateToRecipe(item)}
            activeOpacity={0.7}
          >
            {/* Recipe Image */}
            <View style={styles.imageContainer}>
              <Image
                source={{ uri: item.image }}
                style={styles.recipeImage}
                defaultSource={{ uri: 'https://via.placeholder.com/300x200/CCCCCC/666666?text=Recipe+Image' }}
              />
              <View style={styles.imageOverlay}>
                <View style={styles.ratingBadge}>
                  <Ionicons name="star" size={12} color="#FFD700" />
                  <Text style={styles.ratingText}>{item.rating}</Text>
                </View>
                <TouchableOpacity
                  style={styles.heartButton}
                  onPress={() => removeFromFavorites(item.id)}
                >
                  <Ionicons name="heart" size={20} color={Colors.danger} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Recipe Info */}
            <View style={styles.recipeInfo}>
              <View style={styles.recipeHeader}>
                <Text style={styles.recipeName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.lastViewed}>{item.lastViewed}</Text>
              </View>
              
              <Text style={styles.recipeDescription} numberOfLines={2}>
                {item.description}
              </Text>
              
              <View style={styles.recipeMeta}>
                <View style={styles.metaItem}>
                  <Ionicons name="time-outline" size={14} color={Colors.textLight} />
                  <Text style={styles.metaText}>{item.prepTime}</Text>
                </View>
                
                <View style={styles.metaItem}>
                  <Ionicons name="flame-outline" size={14} color={Colors.textLight} />
                  <Text style={styles.metaText}>{item.calories} cal</Text>
                </View>
                
                {item.isGlutenFree && (
                  <View style={[styles.metaItem, styles.badge]}>
                    <Text style={styles.badgeText}>GF</Text>
                  </View>
                )}
                
                {item.isVegan && (
                  <View style={[styles.metaItem, styles.badge, styles.veganBadge]}>
                    <Text style={styles.badgeText}>Vegan</Text>
                  </View>
                )}
              </View>
            </View>
          </TouchableOpacity>
        ))}

        {/* Info Box */}
        <View style={styles.infoBox}>
          <Ionicons name="information-circle-outline" size={24} color={Colors.primary} />
          <View style={styles.infoContent}>
            <Text style={styles.infoTitle}>Demo Mode Active</Text>
            <Text style={styles.infoText}>
              This is showing sample favorite recipes. In production, users will see their actual saved recipes.
              Toggle "Hide Mock" to see the empty state.
            </Text>
          </View>
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
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 20,
    backgroundColor: Colors.background,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.textLight,
    marginTop: 4,
  },
  mockToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  mockToggleText: {
    color: Colors.primary,
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 6,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  emptyTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: Colors.text,
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    fontSize: 16,
    color: Colors.textLight,
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 40,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginBottom: 12,
    minWidth: 200,
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  secondaryButton: {
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
  },
  secondaryButtonText: {
    color: Colors.primary,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  sortContainer: {
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.05)',
  },
  sortLabel: {
    fontSize: 14,
    color: Colors.textLight,
    marginBottom: 10,
  },
  sortButtons: {
    flexDirection: 'row',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.05)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    marginRight: 10,
  },
  sortButtonActive: {
    backgroundColor: Colors.primary,
  },
  sortButtonText: {
    color: Colors.text,
    fontSize: 14,
    fontWeight: '500',
    marginLeft: 6,
  },
  sortButtonTextActive: {
    color: 'white',
  },
  clearButton: {
    backgroundColor: 'rgba(255, 59, 48, 0.1)',
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  favoriteCard: {
    backgroundColor: 'white',
    borderRadius: 16,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  imageContainer: {
    height: 180,
    position: 'relative',
  },
  recipeImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  imageOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 12,
  },
  ratingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  ratingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  heartButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  recipeInfo: {
    padding: 16,
  },
  recipeHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  recipeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.text,
    flex: 1,
  },
  lastViewed: {
    fontSize: 12,
    color: Colors.textLight,
    marginLeft: 8,
  },
  recipeDescription: {
    fontSize: 14,
    color: Colors.textLight,
    lineHeight: 20,
    marginBottom: 12,
  },
  recipeMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 16,
  },
  metaText: {
    fontSize: 13,
    color: Colors.textLight,
    marginLeft: 4,
  },
  badge: {
    backgroundColor: 'rgba(74, 144, 226, 0.1)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  veganBadge: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: Colors.primary,
  },
  infoBox: {
    flexDirection: 'row',
    backgroundColor: 'rgba(74, 144, 226, 0.05)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 30,
    marginTop: 10,
  },
  infoContent: {
    flex: 1,
    marginLeft: 12,
  },
  infoTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.primary,
    marginBottom: 4,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textLight,
    lineHeight: 18,
  },
});