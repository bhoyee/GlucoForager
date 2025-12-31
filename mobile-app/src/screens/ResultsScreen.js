import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import RecipeCard from '../components/common/RecipeCard';
import Header from '../components/common/Header';
import { globalStyles, colors } from '../styles/global';

const ResultsScreen = ({ route }) => {
  const { results = [], filters = [], detected = [] } = route.params || {};

  return (
    <ScrollView style={globalStyles.screen}>
      <Header title="AI-Generated Recipes" />
      <Text style={[globalStyles.subheading, { marginBottom: 12 }]}>
        Based on your ingredients. {filters.length ? `Filters: ${filters.join(', ')}` : 'No filters applied.'}
      </Text>

      {detected.length ? (
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: 12,
            padding: 10,
            marginBottom: 12,
          }}
        >
          <Text style={{ color: colors.text, fontWeight: '700', marginBottom: 6 }}>AI detected:</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {detected.map((item) => (
              <View
                key={item}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 10,
                  backgroundColor: colors.surface,
                  borderWidth: 1,
                  borderColor: colors.primary,
                }}
              >
                <Text style={{ color: colors.text }}>{item}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {results.length === 0 ? <Text style={{ color: colors.muted }}>No results yet.</Text> : null}
      {results.map((recipe, idx) => (
        <RecipeCard key={recipe.id ?? idx} recipe={recipe} />
      ))}
      <Text style={{ color: colors.muted, textAlign: 'center', marginVertical: 8 }}>
        ✨ AI-generated • Diabetes-friendly
      </Text>
    </ScrollView>
  );
};

export default ResultsScreen;
