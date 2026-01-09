import React, { useState } from 'react';
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
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

export default function ManualInputScreen() {
  const navigation = useNavigation();
  const [ingredients, setIngredients] = useState(['']);
  const [isLoading, setIsLoading] = useState(false);

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

  const handleFindRecipes = () => {
    const validIngredients = ingredients.filter(ing => ing.trim() !== '');
    
    if (validIngredients.length === 0) {
      Alert.alert('Error', 'Please enter at least one ingredient');
      return;
    }

    setIsLoading(true);
    
    // Simulate API call
    setTimeout(() => {
      setIsLoading(false);
      Alert.alert(
        'Recipes Found',
        `Found recipes for: ${validIngredients.join(', ')}`
      );
      // In real app: navigation.navigate('RecipeResults', { ingredients: validIngredients })
    }, 1500);
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color={Colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Type Ingredients</Text>
          <View style={styles.headerRight} />
        </View>

        {/* Instructions */}
        <View style={styles.instructionsContainer}>
          <Ionicons name="information-circle-outline" size={24} color={Colors.primary} />
          <Text style={styles.instructionsText}>
            Enter the ingredients you have available. We'll find diabetes-safe recipes you can make.
          </Text>
        </View>

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
              onPress={() => setIngredients(['chicken breast', 'broccoli', 'garlic'])}
            >
              <Text style={styles.exampleText}>Chicken & Veggies</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.examplePill}
              onPress={() => setIngredients(['salmon', 'asparagus', 'lemon'])}
            >
              <Text style={styles.exampleText}>Fish Dinner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.examplePill}
              onPress={() => setIngredients(['eggs', 'spinach', 'mushrooms'])}
            >
              <Text style={styles.exampleText}>Breakfast</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Find Recipes Button */}
        <TouchableOpacity
          style={[styles.findButton, isLoading && styles.findButtonDisabled]}
          onPress={handleFindRecipes}
          disabled={isLoading}
        >
          <View style={styles.findButtonContent}>
            {isLoading ? (
              <>
                <Ionicons name="refresh" size={20} color="white" style={styles.loadingIcon} />
                <Text style={styles.findButtonText}>Searching Recipes...</Text>
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
    flexGrow: 1,
    paddingBottom: 40,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
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
    marginBottom: 32,
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
  },
  exampleText: {
    fontSize: 14,
    color: Colors.primary,
  },
  findButton: {
    backgroundColor: Colors.primary,
    marginHorizontal: 20,
    borderRadius: 12,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  findButtonDisabled: {
    opacity: 0.7,
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
  loadingIcon: {
    marginRight: 8,
  },
});