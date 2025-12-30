import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import RecipeCard from '../components/common/RecipeCard';
import Header from '../components/common/Header';
import { globalStyles, colors } from '../styles/global';

const ResultsScreen = ({ route }) => {
  const { results = [] } = route.params || {};

  return (
    <ScrollView style={globalStyles.screen}>
      <Header title={`Top matches (${results.length || 3})`} />
      <Text style={[globalStyles.subheading, { marginBottom: 12 }]}>
        AI-generated recipes optimized for diabetes-friendly nutrition.
      </Text>
      {results.length === 0 ? <Text style={{ color: colors.muted }}>No results yet.</Text> : null}
      {results.map((recipe, idx) => (
        <RecipeCard key={recipe.id ?? idx} recipe={recipe} />
      ))}
      <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 8 }}>AI-generated for your tier.</Text>
    </ScrollView>
  );
};

export default ResultsScreen;
