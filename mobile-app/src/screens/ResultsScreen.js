import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import RecipeCard from '../components/common/RecipeCard';
import Header from '../components/common/Header';
import { globalStyles, colors } from '../styles/global';

const mockResults = [
  {
    id: 1,
    title: 'Lemon Garlic Salmon',
    total_time: 25,
    nutritional_info: { calories: 420, carbs: 8, protein: 35, fat: 24, fiber: 2, sugar: 1, glycemic_index: 5 },
    match_score: 0.66,
    used_count: 5,
    total_supplied: 7,
    missing_ingredients: ['lemon', 'olive oil'],
    tags: ['diabetes-friendly', 'low-glycemic'],
    image_url: '',
  },
  {
    id: 2,
    title: 'Chicken Veggie Stir Fry',
    total_time: 30,
    nutritional_info: { calories: 380, carbs: 20, protein: 32, fat: 14, fiber: 6, sugar: 4, glycemic_index: 18 },
    match_score: 0.58,
    used_count: 4,
    total_supplied: 7,
    missing_ingredients: ['ginger'],
    tags: ['diabetes-friendly', 'high-fiber'],
    image_url: '',
  },
  {
    id: 3,
    title: 'Spinach Omelette',
    total_time: 15,
    nutritional_info: { calories: 290, carbs: 6, protein: 22, fat: 18, fiber: 3, sugar: 2, glycemic_index: 0 },
    match_score: 0.74,
    used_count: 5,
    total_supplied: 7,
    missing_ingredients: ['nutritional yeast'],
    tags: ['diabetes-friendly', 'low-carb'],
    image_url: '',
  },
];

const ResultsScreen = () => {
  return (
    <ScrollView style={globalStyles.screen}>
      <Header title="Top matches (3)" />
      <Text style={[globalStyles.subheading, { marginBottom: 12 }]}>
        Prioritized by ingredient match → glycemic index → total time.
      </Text>
      {mockResults.map((recipe) => (
        <RecipeCard key={recipe.id} recipe={recipe} />
      ))}
      <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 8 }}>Showing 3 diabetes-safe options.</Text>
    </ScrollView>
  );
};

export default ResultsScreen;
