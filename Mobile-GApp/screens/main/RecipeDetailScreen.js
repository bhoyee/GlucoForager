import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Image, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '../../constants/Colors';

const mockRecipe = {
  id: 'mock-1',
  name: 'Mediterranean Chicken Salad',
  rating: 4.8,
  time: '25 min',
  servings: 'Serves 2',
  difficulty: 'Easy',
  calories: '320',
  carbs: '18g',
  description:
    'A quick, diabetes-friendly stir fry with lean protein, colorful veggies, and heart-healthy olive oil.',
  image: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=1200&q=80',
  safety: {
    summary: 'Low glycemic impact with balanced carbs, high fiber, and lean protein.',
    carb: 'Carbs are evenly distributed across veggies and lean protein.',
    fiber: 'High fiber from greens helps slow glucose absorption.',
  },
  ingredients: [
    { name: '2 chicken breasts, sliced', owned: true, note: 'lean protein' },
    { name: '2 cups mixed greens', owned: true, note: 'spinach + arugula' },
    { name: '1/2 cup cherry tomatoes', owned: true, note: 'halved' },
    { name: '1/2 cucumber', owned: false, note: 'sliced' },
    { name: '1/4 red onion', owned: false, note: 'thinly sliced' },
    { name: '1 tbsp olive oil', owned: true, note: 'extra virgin' },
    { name: '1 tbsp lemon juice', owned: true, note: 'freshly squeezed' },
    { name: '1 tsp dried oregano', owned: false, note: 'or Italian seasoning' },
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
  const [showSafety, setShowSafety] = useState(true);
  const recipe = route.params?.recipe || mockRecipe;
  const ingredients = recipe.ingredients ?? [];
  const steps = recipe.steps ?? [];
  const tips = recipe.tips ?? [];
  const ownedCount = ingredients.filter((item) => item.owned).length;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Image source={{ uri: recipe.image }} style={styles.heroImage} />
        <TouchableOpacity style={styles.heroBackButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={20} color="white" />
        </TouchableOpacity>
        <TouchableOpacity style={styles.heroFavButton}>
          <Ionicons name="heart-outline" size={20} color="white" />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.quickStats}>
          <View style={styles.statItem}>
            <Ionicons name="time-outline" size={14} color={Colors.textLight} />
            <Text style={styles.statText}>{recipe.time}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="people-outline" size={14} color={Colors.textLight} />
            <Text style={styles.statText}>{recipe.servings}</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="speedometer-outline" size={14} color={Colors.textLight} />
            <Text style={styles.statText}>{recipe.difficulty}</Text>
          </View>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.title}>{recipe.name}</Text>
          <Text style={styles.description}>{recipe.description}</Text>
        </View>

        <TouchableOpacity style={styles.safetyHeader} onPress={() => setShowSafety((prev) => !prev)}>
          <View style={styles.safetyTitleRow}>
            <Ionicons name="medkit-outline" size={18} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Why This Is Diabetes-Safe</Text>
          </View>
          <Ionicons name={showSafety ? 'chevron-up' : 'chevron-down'} size={20} color={Colors.textLight} />
        </TouchableOpacity>
        {showSafety && (
          <View style={styles.safetyCard}>
            <Text style={styles.safetyText}>{recipe.safety?.summary}</Text>
            <Text style={styles.safetyBullet}>Carb distribution: {recipe.safety?.carb}</Text>
            <Text style={styles.safetyBullet}>Fiber benefit: {recipe.safety?.fiber}</Text>
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Ingredients</Text>
            <Text style={styles.ingredientMeta}>
              You have: {ownedCount} of {ingredients.length} ingredients
            </Text>
          </View>
          {ingredients.map((item, index) => (
            <View key={`${item.name}-${index}`} style={styles.ingredientRow}>
              <View style={[styles.ingredientStatus, item.owned ? styles.ownedDot : styles.missingDot]}>
                {item.owned && <Ionicons name="checkmark" size={12} color="white" />}
              </View>
              <View style={styles.ingredientInfo}>
                <Text style={styles.ingredientName}>{item.name}</Text>
                <Text style={styles.ingredientNote}>{item.note}</Text>
              </View>
            </View>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Instructions</Text>
          {steps.map((item, index) => (
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
          {tips.map((item, index) => (
            <View key={`${item}-${index}`} style={styles.tipItem}>
              <Ionicons name="sparkles-outline" size={16} color={Colors.primary} />
              <Text style={styles.tipText}>{item}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.saveButton}>
          <Ionicons name="heart" size={18} color="white" />
          <Text style={styles.saveButtonText}>Save to Favorites</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scrollContent: {
    paddingBottom: 120,
  },
  hero: {
    width: '100%',
    height: 260,
    backgroundColor: Colors.surface,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroBackButton: {
    position: 'absolute',
    top: 54,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroFavButton: {
    position: 'absolute',
    top: 54,
    right: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickStats: {
    marginTop: 16,
    marginHorizontal: 20,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 12,
    color: Colors.textLight,
    fontWeight: '600',
  },
  titleBlock: {
    paddingHorizontal: 20,
    marginTop: 16,
  },
  titleRow: {
    paddingHorizontal: 20,
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: Colors.text,
  },
  description: {
    marginTop: 10,
    color: Colors.textLight,
    lineHeight: 20,
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
  safetyHeader: {
    marginTop: 20,
    marginHorizontal: 20,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  safetyTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  safetyCard: {
    marginHorizontal: 20,
    marginTop: 8,
    padding: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
  },
  safetyText: {
    color: Colors.text,
    marginBottom: 6,
  },
  safetyBullet: {
    color: Colors.textLight,
    marginTop: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  ingredientMeta: {
    color: Colors.textLight,
    fontSize: 12,
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  ingredientStatus: {
    width: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  ownedDot: {
    backgroundColor: Colors.success,
  },
  missingDot: {
    backgroundColor: '#F59E0B',
  },
  ingredientInfo: {
    flex: 1,
  },
  ingredientName: {
    color: Colors.text,
    fontWeight: '600',
  },
  ingredientNote: {
    color: Colors.textLight,
    fontSize: 12,
    marginTop: 2,
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
  bottomBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: Colors.background,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
  },
  saveButton: {
    backgroundColor: Colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  saveButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
