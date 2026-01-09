// screens/main/ScanResultsScreen.js - UPDATED VERSION
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  CheckBox,
  TextInput,
  Alert,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

export default function ScanResultsScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const { images, userIsPremium, scansUsed } = route.params || {};
  
  const [isLoading, setIsLoading] = useState(true);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [detectedIngredients, setDetectedIngredients] = useState([]);
  const [selectedIngredients, setSelectedIngredients] = useState([]);
  const [ingredientToAdd, setIngredientToAdd] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [showRecipeButton, setShowRecipeButton] = useState(false);

  useEffect(() => {
    // Simulate AI processing
    setTimeout(() => {
      // Mock detected ingredients from images
      const mockIngredients = [
        { id: '1', name: 'Chicken Breast', confidence: '95%', selected: true },
        { id: '2', name: 'Broccoli', confidence: '88%', selected: true },
        { id: '3', name: 'Bell Peppers', confidence: '82%', selected: true },
        { id: '4', name: 'Garlic', confidence: '75%', selected: true },
        { id: '5', name: 'Olive Oil', confidence: '90%', selected: true },
        { id: '6', name: 'Onion', confidence: '70%', selected: false },
        { id: '7', name: 'Tomatoes', confidence: '85%', selected: false },
        { id: '8', name: 'Basil', confidence: '60%', selected: false },
      ];
      
      setDetectedIngredients(mockIngredients);
      setSelectedIngredients(mockIngredients.filter(item => item.selected).map(item => item.id));
      setIsLoading(false);
    }, 2000);
  }, []);

  useEffect(() => {
    // Show generate recipe button when at least one ingredient is selected
    setShowRecipeButton(selectedIngredients.length > 0);
  }, [selectedIngredients]);

  const toggleIngredientSelection = (id) => {
    setSelectedIngredients(prev => {
      if (prev.includes(id)) {
        return prev.filter(item => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const selectAllIngredients = () => {
    const allIds = detectedIngredients.map(item => item.id);
    if (selectedIngredients.length === allIds.length) {
      setSelectedIngredients([]);
    } else {
      setSelectedIngredients(allIds);
    }
  };

  const addCustomIngredient = () => {
    if (ingredientToAdd.trim()) {
      const newId = `custom-${Date.now()}`;
      const newIngredient = {
        id: newId,
        name: ingredientToAdd.trim(),
        confidence: 'Manual',
        selected: true
      };
      
      setDetectedIngredients(prev => [...prev, newIngredient]);
      setSelectedIngredients(prev => [...prev, newId]);
      setIngredientToAdd('');
    }
  };

  const handleGenerateRecipes = () => {
    if (selectedIngredients.length === 0) {
      Alert.alert('No Ingredients', 'Please select at least one ingredient to generate recipes.');
      return;
    }
    
    // Get selected ingredient names
    const selectedItems = detectedIngredients
      .filter(item => selectedIngredients.includes(item.id))
      .map(item => item.name);
    
    // Navigate to recipe generation screen
    navigation.navigate('RecipeResults', { 
      selectedIngredients: selectedItems,
      images: images
    });
  };

  const handleScanMore = () => {
    navigation.navigate('Scan');
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>Analyzing your ingredients...</Text>
        {images && (
          <Text style={styles.loadingSubtext}>
            Processing {images.length} image{images.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>
    );
  }

  const renderImageItem = ({ item, index }) => (
    <View style={[styles.imageSlide, activeImageIndex === index && styles.activeSlide]}>
      <Image source={{ uri: item.uri }} style={styles.slideImage} resizeMode="cover" />
      <Text style={styles.imageLabel}>{item.name}</Text>
    </View>
  );

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
        <Text style={styles.headerTitle}>Scan Analysis</Text>
        <TouchableOpacity 
          style={styles.scanAgainButton}
          onPress={handleScanMore}
        >
          <Ionicons name="camera-outline" size={20} color={Colors.primary} />
          <Text style={styles.scanAgainText}>Scan More</Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {/* Images Slideshow */}
        {images && images.length > 0 && (
          <View style={styles.slideshowContainer}>
            <FlatList
              data={images}
              renderItem={renderImageItem}
              keyExtractor={item => item.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(event) => {
                const index = Math.floor(event.nativeEvent.contentOffset.x / event.nativeEvent.layoutMeasurement.width);
                setActiveImageIndex(index);
              }}
            />
            <View style={styles.pagination}>
              {images.map((_, index) => (
                <View 
                  key={index} 
                  style={[
                    styles.paginationDot,
                    activeImageIndex === index && styles.paginationDotActive
                  ]} 
                />
              ))}
            </View>
            <Text style={styles.slideCount}>
              {activeImageIndex + 1} / {images.length}
            </Text>
          </View>
        )}

        {/* Detected Ingredients Section */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Detected Ingredients</Text>
            <View style={styles.sectionActions}>
              <Text style={styles.ingredientCount}>
                {selectedIngredients.length} of {detectedIngredients.length} selected
              </Text>
              <TouchableOpacity 
                style={styles.selectAllButton}
                onPress={selectAllIngredients}
              >
                <Text style={styles.selectAllText}>
                  {selectedIngredients.length === detectedIngredients.length ? 'Deselect All' : 'Select All'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
          
          <View style={styles.ingredientsList}>
            {detectedIngredients.map((item) => (
              <TouchableOpacity 
                key={item.id}
                style={[
                  styles.ingredientItem,
                  selectedIngredients.includes(item.id) && styles.ingredientItemSelected
                ]}
                onPress={() => toggleIngredientSelection(item.id)}
              >
                <View style={styles.ingredientContent}>
                  <View style={styles.checkboxContainer}>
                    <View style={[
                      styles.checkbox,
                      selectedIngredients.includes(item.id) && styles.checkboxChecked
                    ]}>
                      {selectedIngredients.includes(item.id) && (
                        <Ionicons name="checkmark" size={14} color="white" />
                      )}
                    </View>
                  </View>
                  <View style={styles.ingredientInfo}>
                    <Text style={styles.ingredientName}>{item.name}</Text>
                    <Text style={styles.ingredientConfidence}>{item.confidence} confidence</Text>
                  </View>
                  {item.confidence === 'Manual' ? (
                    <TouchableOpacity 
                      style={styles.deleteCustomButton}
                      onPress={() => {
                        setDetectedIngredients(prev => prev.filter(i => i.id !== item.id));
                        setSelectedIngredients(prev => prev.filter(id => id !== item.id));
                      }}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.danger} />
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.ingredientIcon}>
                      <Ionicons name="checkmark-circle" size={20} color={Colors.success} />
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Add Custom Ingredient */}
        <View style={styles.addIngredientSection}>
          <Text style={styles.addIngredientTitle}>Add Missing Ingredient</Text>
          <View style={styles.addIngredientRow}>
            <TextInput
              style={styles.ingredientInput}
              placeholder="Type ingredient name..."
              value={ingredientToAdd}
              onChangeText={setIngredientToAdd}
              onSubmitEditing={addCustomIngredient}
            />
            <TouchableOpacity 
              style={styles.addButton}
              onPress={addCustomIngredient}
              disabled={!ingredientToAdd.trim()}
            >
              <Ionicons name="add" size={24} color="white" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Generate Recipes Button */}
        {showRecipeButton && (
          <TouchableOpacity 
            style={styles.generateButton}
            onPress={handleGenerateRecipes}
          >
            <Ionicons name="restaurant-outline" size={24} color="white" />
            <Text style={styles.generateButtonText}>
              Generate Recipes ({selectedIngredients.length} ingredients)
            </Text>
            <Ionicons name="chevron-forward" size={20} color="white" />
          </TouchableOpacity>
        )}

        {/* Scan Info */}
        {!userIsPremium && (
          <View style={styles.scanInfo}>
            <Ionicons name="information-circle-outline" size={16} color={Colors.textLight} />
            <Text style={styles.scanInfoText}>
              You've used {scansUsed || 1} scan{scansUsed !== 1 ? 's' : ''} today
            </Text>
          </View>
        )}
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
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.background,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: Colors.text,
    fontWeight: '500',
  },
  loadingSubtext: {
    marginTop: 8,
    fontSize: 14,
    color: Colors.textLight,
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
    width: 40,
    height: 40,
    borderRadius: 20,
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
  slideshowContainer: {
    marginBottom: 24,
  },
  imageSlide: {
    width: 350,
    marginHorizontal: 10,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: Colors.surface,
  },
  activeSlide: {
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  slideImage: {
    width: '100%',
    height: 250,
  },
  imageLabel: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(0,0,0,0.7)',
    color: 'white',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    fontSize: 12,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.border,
    marginHorizontal: 4,
  },
  paginationDotActive: {
    backgroundColor: Colors.primary,
    width: 12,
  },
  slideCount: {
    textAlign: 'center',
    color: Colors.textLight,
    fontSize: 12,
    marginTop: 4,
  },
  section: {
    marginBottom: 24,
    paddingHorizontal: 20,
  },
  sectionHeader: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  sectionActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.text,
  },
  ingredientCount: {
    fontSize: 14,
    color: Colors.textLight,
    fontWeight: '500',
    marginRight: 12,
  },
  selectAllButton: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: Colors.surface,
    borderRadius: 8,
  },
  selectAllText: {
    fontSize: 14,
    color: Colors.primary,
    fontWeight: '500',
  },
  ingredientsList: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    overflow: 'hidden',
  },
  ingredientItem: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ingredientItemSelected: {
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
  },
  ingredientContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkboxContainer: {
    marginRight: 12,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: Colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: Colors.primary,
    borderColor: Colors.primary,
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 2,
  },
  ingredientConfidence: {
    fontSize: 12,
    color: Colors.textLight,
  },
  ingredientIcon: {
    marginLeft: 8,
  },
  deleteCustomButton: {
    padding: 4,
  },
  addIngredientSection: {
    paddingHorizontal: 20,
    marginBottom: 24,
  },
  addIngredientTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: Colors.text,
    marginBottom: 12,
  },
  addIngredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ingredientInput: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  addButton: {
    backgroundColor: Colors.primary,
    width: 52,
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
  },
  generateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
    marginHorizontal: 20,
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  generateButtonText: {
    marginLeft: 8,
    marginRight: 4,
    fontSize: 16,
    color: 'white',
    fontWeight: '600',
    flex: 1,
  },
  scanInfo: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  scanInfoText: {
    marginLeft: 6,
    fontSize: 14,
    color: Colors.textLight,
  },
});
