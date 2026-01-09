import React from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

const mockRecipe = {
  id: 'mock-1',
  name: 'Mediterranean Chicken Stir Fry',
  rating: 4.8,
  time: '25 min',
  calories: '320',
  carbs: '18g',
  description:
    'A quick, diabetes-friendly stir fry with lean protein, colorful veggies, and heart-healthy olive oil.',
  image: 'https://images.unsplash.com/photo-1546069901-eacef0df6022?w=1200&q=80',
  ingredients: [
    '2 chicken breasts, sliced',
    '1 cup broccoli florets',
    '1 bell pepper, sliced',
    '1/2 onion, sliced',
    '2 cloves garlic, minced',
    '1 tbsp olive oil',
    '1 tsp dried oregano',
    'Salt and pepper to taste',
  ],
  steps: [
    'Heat olive oil in a large pan over medium heat.',
    'Add chicken and cook until lightly browned, about 5 minutes.',
    'Stir in garlic, onion, broccoli, and bell pepper. Cook 6-8 minutes.',
    'Season with oregano, salt, and pepper.',
    'Serve warm with a side salad or cauliflower rice.',
  ],
  tips: [
    'Swap chicken for tofu for a vegetarian option.',
    'Add a squeeze of lemon for brightness.',
    'Keep portions balanced to manage carbs.',
  ],
};

export default function RecipeDetailScreen({ navigation, route }) {
  const recipe = route.params?.recipe || mockRecipe;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Recipe Details</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <Image source={{ uri: recipe.image }} style={styles.heroImage} />

        <View style={styles.titleRow}>
          <Text style={styles.title}>{recipe.name}</Text>
          <View style={styles.rating}>
            <Ionicons name="star" size={16} color="#FFD700" />
            <Text style={styles.ratingText}>{recipe.rating}</Text>
          </View>
        </View>
        <Text style={styles.description}>{recipe.description}</Text>

        <View style={styles.metaRow}>
          <View style={styles.metaChip}>
            <Ionicons name="time-outline" size={14} color={Colors.textLight} />
            <Text style={styles.metaText}>{recipe.time}</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="flame-outline" size={14} color={Colors.textLight} />
            <Text style={styles.metaText}>{recipe.calories} cal</Text>
          </View>
          <View style={styles.metaChip}>
            <Ionicons name="nutrition-outline" size={14} color={Colors.textLight} />
            <Text style={styles.metaText}>{recipe.carbs} carbs</Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ingredients</Text>
          {recipe.ingredients.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.listItem}>
              <Ionicons name="checkmark-circle" size={18} color={Colors.success} />
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Steps</Text>
          {recipe.steps.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.stepItem}>
              <View style={styles.stepBadge}>
                <Text style={styles.stepNumber}>{index + 1}</Text>
              </View>
              <Text style={styles.stepText}>{item}</Text>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Tips</Text>
          {recipe.tips.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.tipItem}>
              <Ionicons name="sparkles-outline" size={16} color={Colors.primary} />
              <Text style={styles.tipText}>{item}</Text>
            </View>
          ))}
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 60,
    paddingBottom: 16,
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
    fontWeight: '700',
    color: Colors.text,
  },
  scrollContent: {
    paddingBottom: 30,
  },
  heroImage: {
    width: '92%',
    height: 220,
    borderRadius: 16,
    alignSelf: 'center',
  },
  titleRow: {
    paddingHorizontal: 20,
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
    marginRight: 10,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  ratingText: {
    marginLeft: 4,
    fontSize: 14,
    color: Colors.text,
    fontWeight: '600',
  },
  description: {
    paddingHorizontal: 20,
    marginTop: 10,
    color: Colors.textLight,
    lineHeight: 20,
  },
  metaRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 14,
    gap: 10,
  },
  metaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  metaText: {
    marginLeft: 6,
    fontSize: 12,
    color: Colors.textLight,
  },
  section: {
    marginTop: 24,
    paddingHorizontal: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: Colors.text,
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  listText: {
    marginLeft: 10,
    color: Colors.text,
    flex: 1,
  },
  stepItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  stepBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  stepNumber: {
    color: 'white',
    fontWeight: '700',
    fontSize: 12,
  },
  stepText: {
    flex: 1,
    color: Colors.text,
    lineHeight: 20,
  },
  tipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  tipText: {
    marginLeft: 8,
    color: Colors.text,
  },
});
